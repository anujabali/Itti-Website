/**
 * What the gateway says happened, independent of what the browser says.
 *
 * The browser's word is taken in `donations/verify`, which is enough for the
 * donor to be thanked on screen. It is not enough for the record: a donor who
 * pays and then closes the tab never reaches that step, and their money would
 * sit against a row still marked `created`. This endpoint is the gateway
 * telling us directly, and it is the one the books should trust.
 *
 * It runs without a JWT, because Razorpay has none to send. The signature over
 * the raw body is what stands in for one, and the body must be read as text
 * before it is parsed — re-serialising JSON changes the bytes and the signature
 * would never match again.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { hmacHex, sameSignature } from '../_shared/razorpay.ts';

const SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
	if (req.method !== 'POST') return new Response('method', { status: 405 });

	// Fails closed. An unset secret is a misconfiguration, and the wrong thing
	// for a misconfigured webhook to do is believe whoever called it.
	if (!SECRET) {
		console.error('[itti/donations-webhook] no secret configured');
		return new Response('not configured', { status: 503 });
	}

	const raw = await req.text();
	const given = req.headers.get('X-Razorpay-Signature') ?? '';
	const expected = await hmacHex(raw, SECRET);
	if (!sameSignature(expected, given)) {
		console.error('[itti/donations-webhook] signature mismatch');
		return new Response('signature', { status: 400 });
	}

	let event: {
		event?: string;
		payload?: { payment?: { entity?: Record<string, unknown> } };
	};
	try {
		event = JSON.parse(raw);
	} catch {
		return new Response('bad request', { status: 400 });
	}

	const payment = event.payload?.payment?.entity;
	const orderId = typeof payment?.order_id === 'string' ? payment.order_id : '';
	if (!orderId) return new Response('ok', { status: 200 });

	const supabase = createClient(
		Deno.env.get('SUPABASE_URL')!,
		Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
		{ auth: { persistSession: false } },
	);

	const paymentId = typeof payment?.id === 'string' ? payment.id : null;

	if (event.event === 'payment.captured') {
		await supabase
			.from('donation')
			.update({ status: 'paid', payment_id: paymentId, paid_at: new Date().toISOString() })
			.eq('order_id', orderId)
			// Never walk a refund backwards into a payment.
			.in('status', ['created', 'paid']);
	} else if (event.event === 'payment.failed') {
		const description =
			typeof payment?.error_description === 'string' ? payment.error_description : null;
		await supabase
			.from('donation')
			.update({ status: 'failed', last_error: description })
			.eq('order_id', orderId)
			.eq('status', 'created');
	} else if (event.event === 'refund.processed') {
		await supabase.from('donation').update({ status: 'refunded' }).eq('order_id', orderId);
	}

	// Anything else is acknowledged and ignored. A webhook that returns an error
	// for an event it does not care about gets retried forever.
	return new Response('ok', { status: 200 });
});
