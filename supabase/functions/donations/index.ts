/**
 * Taking a donation.
 *
 * Two steps, and the order of them is the point. `create` records the intent
 * and asks the gateway for an order before the donor is sent anywhere, so a
 * payment that arrives for an order we never made is one we refuse to record.
 * `verify` accepts the browser's word for what happened only after checking the
 * gateway's signature over it, which the browser cannot forge because it has
 * never seen the secret.
 *
 * The amount is never taken from the browser at the second step. It is read
 * back from the row created at the first, so a donor cannot pay ten rupees and
 * be receipted for ten thousand.
 *
 * The acknowledgement is sent from here rather than through the notification
 * outbox: that table is keyed to a registered person, and a donation from a
 * stranger is not a lesser donation.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
	configured,
	cors,
	createOrder,
	fetchPayment,
	hmacHex,
	isTestMode,
	keyId,
	sameSignature,
} from '../_shared/razorpay.ts';
import { acknowledgement } from './receipt.ts';

/** ₹100 to ₹5,00,000, in paise. A floor because a one-rupee order is a test or
 *  a nuisance, and a ceiling because a gift larger than this should reach a
 *  person before it reaches a payment page. */
const MIN_PAISE = 100_00;
const MAX_PAISE = 5_00_000_00;

const PILLARS = new Set(['neurodivergence', 'cancer_care', 'claw']);

const FROM = Deno.env.get('NOTIFY_FROM') ?? 'The Itti Foundation <hello@itti.org.in>';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');

const db = () =>
	createClient(
		Deno.env.get('SUPABASE_URL')!,
		Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
		{ auth: { persistSession: false } },
	);

const json = (body: unknown, status: number, headers: Record<string, string>) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { ...headers, 'Content-Type': 'application/json' },
	});

const email = async (to: string, subject: string, text: string, html: string) => {
	if (!RESEND_KEY) return;
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
	});
	// A receipt that fails to send must not fail the donation. The money has
	// already arrived; the row is the record, and the email is a courtesy that
	// can be repeated by hand.
	if (!res.ok) console.error('[itti/donations] receipt', res.status, await res.text());
};

Deno.serve(async (req) => {
	const headers = cors(req.headers.get('Origin'));

	if (req.method === 'OPTIONS') return new Response('ok', { headers });
	if (req.method !== 'POST') return json({ error: 'method' }, 405, headers);

	if (!configured) {
		// Fails closed. A gateway without keys must not look like a gateway.
		return json({ error: 'not_configured' }, 503, headers);
	}

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return json({ error: 'bad_request' }, 400, headers);
	}

	const supabase = db();

	// ── Step one: record the intent, then ask for an order ──────────────────
	if (body.action === 'create') {
		const paise = Math.round(Number(body.amountPaise));
		if (!Number.isSafeInteger(paise) || paise < MIN_PAISE || paise > MAX_PAISE) {
			return json({ error: 'amount' }, 400, headers);
		}

		const pillar =
			typeof body.pillar === 'string' && PILLARS.has(body.pillar) ? body.pillar : null;

		let order: { id: string };
		try {
			order = await createOrder({
				amount: paise,
				receipt: crypto.randomUUID(),
				notes: pillar ? { pillar } : {},
			});
		} catch (e) {
			console.error('[itti/donations] order', e);
			return json({ error: 'gateway' }, 502, headers);
		}

		const { error } = await supabase.from('donation').insert({
			amount_paise: paise,
			pillar,
			order_id: order.id,
		});
		if (error) {
			console.error('[itti/donations] insert', error);
			return json({ error: 'store' }, 500, headers);
		}

		return json({ orderId: order.id, keyId, amountPaise: paise, test: isTestMode }, 200, headers);
	}

	// ── Step two: believe the browser only after the signature agrees ───────
	if (body.action === 'verify') {
		const orderId = String(body.orderId ?? '');
		const paymentId = String(body.paymentId ?? '');
		const signature = String(body.signature ?? '');
		if (!orderId || !paymentId || !signature) return json({ error: 'bad_request' }, 400, headers);

		const expected = await hmacHex(`${orderId}|${paymentId}`);
		if (!sameSignature(expected, signature)) {
			console.error('[itti/donations] signature mismatch', orderId);
			return json({ error: 'signature' }, 400, headers);
		}

		const trim = (v: unknown, max: number) =>
			typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

		// The amount is taken from the row, never from the request.
		const { data: row, error: readError } = await supabase
			.from('donation')
			.select('id, amount_paise, pillar, status')
			.eq('order_id', orderId)
			.maybeSingle();

		if (readError || !row) return json({ error: 'unknown_order' }, 404, headers);

		// Who gave, according to the gateway rather than according to the page.
		const paid = await fetchPayment(paymentId);
		const donorEmail = trim(paid.email, 320);
		const donorName = trim(body.name, 160);

		const { error } = await supabase
			.from('donation')
			.update({
				status: 'paid',
				payment_id: paymentId,
				paid_at: new Date().toISOString(),
				donor_name: donorName,
				donor_email: donorEmail ? donorEmail.toLowerCase() : null,
				donor_phone: trim(paid.contact, 32),
			})
			.eq('id', row.id)
			// The webhook may have got here first. Marking a paid row paid again is
			// harmless; marking a refunded one paid is not.
			.in('status', ['created', 'paid']);

		if (error) {
			console.error('[itti/donations] update', error);
			return json({ error: 'store' }, 500, headers);
		}

		if (donorEmail) {
			const note = acknowledgement({
				name: donorName,
				amountPaise: row.amount_paise as number,
				pillar: row.pillar as string | null,
				paymentId,
				test: isTestMode,
			});
			await email(donorEmail, note.subject, note.text, note.html);
		}

		return json({ ok: true }, 200, headers);
	}

	return json({ error: 'unknown_action' }, 400, headers);
});
