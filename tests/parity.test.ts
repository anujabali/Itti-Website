import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	isValidE164,
	isValidEmail,
	isValidIndianPincode,
} from '../src/lib/validation/rules';

/**
 * The browser and the database check the same things separately: one so a
 * person is told before a round trip, the other because the REST endpoint is
 * reachable without ever loading the page. Two copies of a rule drift, and this
 * pair already did — the browser wanted a two-character TLD while SQL accepted
 * one, so `a@b.c` was refused in the form and accepted by the function.
 *
 * These tests read the rules out of the migration that is actually deployed and
 * check both copies answer the same. They fail when the two are edited apart.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** The newest migration that redefines register_member is the live one. */
const liveFunctionSource = (): string => {
	const files = readdirSync(MIGRATIONS)
		.filter((f) => f.endsWith('.sql'))
		.sort();
	for (const file of [...files].reverse()) {
		const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
		if (sql.includes('create or replace function register_member')) return sql;
	}
	throw new Error('no migration defines register_member');
};

/** POSIX classes to their JavaScript equivalents; nothing else is translated. */
const toJsRegExp = (posix: string): RegExp =>
	new RegExp(posix.replace(/\[:space:\]/g, '\\s'));

const extract = (sql: string, marker: string): RegExp => {
	const re = new RegExp(`${marker}\\s*!~\\s*'([^']+)'`);
	const m = re.exec(sql);
	if (!m) throw new Error(`no rule found for ${marker}`);
	return toJsRegExp(m[1]!);
};

const CORPUS = {
	email: [
		'a@b.co',
		'a@b.c',
		'name@example.com',
		'name+tag@example.co.in',
		'',
		' ',
		'a@b',
		'@b.co',
		'a b@c.co',
		'a@@b.co',
		'a@b.',
		'a@.co',
		'UPPER@EXAMPLE.COM',
		'a@b.museum',
	],
	phone: [
		'+919876543210',
		'+442079460000',
		'+0123456789',
		'919876543210',
		'+1234567',
		'+1234567890123456',
		'',
		'+',
		'+91 98765 43210',
	],
	pincode: ['411001', '011001', '41100', '4110011', '', 'abc123', '600001'],
};

describe('the browser and the database agree', () => {
	const sql = liveFunctionSource();

	it('on what an email address is', () => {
		const sqlRule = extract(sql, 'v_email');
		for (const value of CORPUS.email) {
			expect(isValidEmail(value), `"${value}"`).toBe(sqlRule.test(value.trim()));
		}
	});

	it('on what a phone number is', () => {
		const sqlRule = extract(sql, 'v_phone');
		for (const value of CORPUS.phone) {
			// SQL sees the number already normalised, so compare on the same input.
			expect(isValidE164(value), `"${value}"`).toBe(sqlRule.test(value.trim()));
		}
	});

	it('on what a PIN code is', () => {
		const sqlRule = extract(sql, 'v_pincode');
		for (const value of CORPUS.pincode) {
			expect(isValidIndianPincode(value), `"${value}"`).toBe(
				sqlRule.test(value.trim()),
			);
		}
	});
});

describe('every option the form offers is one the database accepts', () => {
	const sql = liveFunctionSource();
	const overlay = readFileSync(
		join(process.cwd(), 'src', 'components', 'forms', 'form-1', 'Form1Overlay.astro'),
		'utf8',
	);

	/** The values SQL lists in its `not in (...)` guard for a variable. */
	const accepted = (marker: string): string[] => {
		const m = new RegExp(`${marker}[\\s\\S]{0,80}?not in \\(([^)]+)\\)`).exec(sql);
		if (!m) throw new Error(`no accepted list for ${marker}`);
		return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
	};

	/** The values the form can actually submit for a field. */
	const offered = (name: string): string[] => {
		const values = new Set<string>();
		for (const m of overlay.matchAll(
			new RegExp(
				`name="${name}"[^>]*value="([^"]*)"|value="([^"]*)"[^>]*name="${name}"`,
				'g',
			),
		)) {
			const v = m[1] ?? m[2] ?? '';
			if (v) values.add(v);
		}
		for (const m of overlay.matchAll(
			new RegExp(`<select[^>]*name="${name}"[\\s\\S]*?</select>`, 'g'),
		)) {
			for (const opt of m[0].matchAll(/<option value="([^"]*)"/g)) {
				if (opt[1]) values.add(opt[1]);
			}
		}
		return [...values];
	};

	it.each([
		['role', 'v_role'],
		['gender', 'v_gender'],
		['pillars', 'v_pillar'],
		['heardFrom', 'v_heard'],
	])('for %s', (field, marker) => {
		const ok = accepted(marker);
		const given = offered(field);
		expect(given.length, `no options found for ${field}`).toBeGreaterThan(0);
		for (const value of given) {
			// The form says "supporter"; the service maps it to the enum's "volunteer".
			const mapped = value === 'supporter' ? 'volunteer' : value;
			expect(ok, `${field}="${value}"`).toContain(mapped);
		}
	});
});

describe('the success screen reads keys the payload actually has', () => {
	const overlay = readFileSync(
		join(process.cwd(), 'src', 'components', 'forms', 'form-1', 'Form1Overlay.astro'),
		'utf8',
	);
	const schema = readFileSync(
		join(process.cwd(), 'src', 'components', 'forms', 'form-1', 'schema.ts'),
		'utf8',
	);

	/**
	 * `mapForm1ToSupabase` builds the object the success summary reads. Renaming
	 * a key in one and not the other throws on every successful registration —
	 * which is exactly what happened when `selected_pillar` became plural: the
	 * summary rendered empty and left an uncaught error behind it.
	 */
	it('every payload.meta.* the overlay reads is one the mapper writes', () => {
		const written = new Set([...schema.matchAll(/^\t{3}(\w+):/gm)].map((m) => m[1]!));
		const read = [...overlay.matchAll(/payload\.meta\.(\w+)/g)].map((m) => m[1]!);

		expect(read.length, 'the summary reads nothing from meta').toBeGreaterThan(0);
		for (const key of read) {
			expect([...written], `payload.meta.${key}`).toContain(key);
		}
	});
});
