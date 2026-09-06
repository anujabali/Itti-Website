/**
 * Sends what the outbox says is owed.
 *
 * Reads `notification` rows that are still pending, sends each one, and records
 * what happened. Safe to run again at any time: a row leaves `pending` the
 * moment it is claimed, and `unique (person_id, kind)` means the outbox cannot
 * hold two of the same message for the same person in the first place.
 *
 * Invoked by a database webhook when a row is inserted, and safe to call on a
 * schedule as well — a webhook that never arrives should not mean an
 * acknowledgement that never arrives.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { guardianNotice, welcome, type Message } from './messages.ts';

const MAX_ATTEMPTS = 5;
const BATCH = 25;

const FROM = Deno.env.get('NOTIFY_FROM') ?? 'The Itti Foundation <hello@itti.org.in>';
const REPLY_TO = Deno.env.get('NOTIFY_REPLY_TO') ?? undefined;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');

const build = (kind: string, payload: Record<string, unknown>): Message | null => {
	if (kind === 'welcome') return welcome(payload);
	if (kind === 'guardian_notice') return guardianNotice(payload);
	return null;
};

const send = async (to: string, m: Message): Promise<void> => {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${RESEND_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: FROM,
			to: [to],
			subject: m.subject,
			text: m.text,
			html: m.html,
			...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
		}),
	});

	if (!res.ok) {
		// The body carries the reason; it is what makes a failure diagnosable
		// three days later without reproducing it.
		throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
	}
};

Deno.serve(async (req) => {
	// The function runs without a JWT so a database webhook can reach it, which
	// would otherwise leave it open to anyone who guesses the URL. A shared
	// secret is what stands in for the JWT. Compared in full rather than
	// early-exiting on the first wrong character.
	const secret = Deno.env.get('NOTIFY_HOOK_SECRET');
	// Fails closed. An unset secret is a misconfiguration, and the wrong thing
	// for a misconfigured mailer to do is send.
	if (!secret) {
		return Response.json(
			{ ok: false, error: 'NOTIFY_HOOK_SECRET is not set.' },
			{ status: 500 },
		);
	}
	{
		const given = req.headers.get('x-notify-secret') ?? '';
		const a = new TextEncoder().encode(given);
		const b = new TextEncoder().encode(secret);
		const ok =
			a.length === b.length &&
			a.reduce((acc, byte, i) => acc | (byte ^ b[i]!), 0) === 0;
		if (!ok) return Response.json({ ok: false }, { status: 401 });
	}

	if (!RESEND_KEY) {
		return Response.json(
			{ ok: false, error: 'RESEND_API_KEY is not set; nothing was sent.' },
			{ status: 500 },
		);
	}

	const db = createClient(
		Deno.env.get('SUPABASE_URL')!,
		Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
	);

	const { data: rows, error } = await db
		.from('notification')
		.select('id, kind, to_address, payload, attempts')
		.eq('status', 'pending')
		.lt('attempts', MAX_ATTEMPTS)
		.order('created_at', { ascending: true })
		.limit(BATCH);

	if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

	let sent = 0;
	let failed = 0;

	for (const row of rows ?? []) {
		const message = build(row.kind, row.payload ?? {});

		if (!message || !row.to_address) {
			await db
				.from('notification')
				.update({
					status: 'skipped',
					last_error: message ? 'no address' : `unknown kind: ${row.kind}`,
				})
				.eq('id', row.id);
			continue;
		}

		try {
			await send(row.to_address, message);
			await db
				.from('notification')
				.update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
				.eq('id', row.id);
			sent++;
		} catch (e) {
			const attempts = (row.attempts ?? 0) + 1;
			await db
				.from('notification')
				.update({
					// Stays pending while there are attempts left, so the next run
					// picks it up. Only a run out of attempts is a failure.
					status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
					attempts,
					last_error: e instanceof Error ? e.message.slice(0, 500) : 'unknown error',
				})
				.eq('id', row.id);
			failed++;
		}
	}

	return Response.json({ ok: true, considered: rows?.length ?? 0, sent, failed });
});
