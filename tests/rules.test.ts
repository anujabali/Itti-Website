import { describe, expect, it } from 'vitest';
import {
	LIMITS,
	checkDateOfBirth,
	isMinor,
	isValidE164,
	isValidEmail,
	isValidIndianPincode,
	toE164,
} from '../src/lib/validation/rules';

const isoDaysFromToday = (days: number) => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + days);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isoYearsFromToday = (years: number, offsetDays = 0) => {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setFullYear(d.getFullYear() + years);
	d.setDate(d.getDate() + offsetDays);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('email', () => {
	it('needs a two-character TLD, which is where the browser and the database once disagreed', () => {
		expect(isValidEmail('a@b.co')).toBe(true);
		expect(isValidEmail('a@b.c')).toBe(false);
	});

	it('rejects the shapes that are not addresses', () => {
		for (const bad of ['', ' ', 'a@b', '@b.co', 'a b@c.co', 'a@@b.co', 'a@b .co']) {
			expect(isValidEmail(bad), bad).toBe(false);
		}
	});
});

describe('phone', () => {
	it('assumes India only for a bare ten-digit mobile', () => {
		expect(toE164('9876543210')).toBe('+919876543210');
		expect(toE164('1234567890')).toBe('1234567890'); // not an Indian mobile: left alone
	});

	it('keeps a country code it was given, however it was written', () => {
		expect(toE164('+44 20 7946 0000')).toBe('+442079460000');
		expect(toE164('0044 20 7946 0000')).toBe('+442079460000');
		expect(toE164('(+91) 98765-43210')).toBe('+919876543210');
	});

	it('is empty for nothing', () => {
		expect(toE164('')).toBeNull();
		expect(toE164(undefined)).toBeNull();
	});

	it('validates E.164 the way person.phone does', () => {
		expect(isValidE164('+919876543210')).toBe(true);
		expect(isValidE164('+0123456789')).toBe(false); // no leading zero after +
		expect(isValidE164('919876543210')).toBe(false); // no +
		expect(isValidE164('+1234567')).toBe(false); // too short
		expect(isValidE164('+1234567890123456')).toBe(false); // too long
	});
});

describe('pincode', () => {
	it('is six digits and does not start with zero', () => {
		expect(isValidIndianPincode('411001')).toBe(true);
		expect(isValidIndianPincode('011001')).toBe(false);
		expect(isValidIndianPincode('41100')).toBe(false);
		expect(isValidIndianPincode('4110011')).toBe(false);
	});
});

describe('date of birth', () => {
	it('accepts today, which a UTC-vs-local comparison used to call the future', () => {
		expect(checkDateOfBirth(isoDaysFromToday(0)).valid).toBe(true);
	});

	it('rejects tomorrow', () => {
		expect(checkDateOfBirth(isoDaysFromToday(1)).valid).toBe(false);
	});

	it('rejects a date that does not exist rather than rolling it forward', () => {
		expect(checkDateOfBirth('1990-02-31').valid).toBe(false);
		expect(checkDateOfBirth('1990-13-01').valid).toBe(false);
	});

	it('holds the 120-year bound', () => {
		expect(checkDateOfBirth(isoYearsFromToday(-LIMITS.maxAgeYears, 1)).valid).toBe(
			true,
		);
		expect(checkDateOfBirth(isoYearsFromToday(-LIMITS.maxAgeYears)).valid).toBe(false);
	});

	it('treats an absent date as acceptable, because it is optional', () => {
		expect(checkDateOfBirth('').valid).toBe(true);
	});
});

describe('isMinor', () => {
	it('is false on the eighteenth birthday and true the day before', () => {
		expect(isMinor(isoYearsFromToday(-LIMITS.adultAge))).toBe(false);
		expect(isMinor(isoYearsFromToday(-LIMITS.adultAge, 1))).toBe(true);
	});

	it('is false for an adult and for no answer', () => {
		expect(isMinor('1990-01-01')).toBe(false);
		expect(isMinor('')).toBe(false);
		expect(isMinor(undefined)).toBe(false);
	});
});
