/**
 * The parts of the gateway both functions need.
 *
 * The secret never leaves this side. The browser is given the publishable key
 * id and an order id, and nothing else; every claim it makes afterwards about
 * what was paid is checked here against a signature it could not have forged.
 */

const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

export const keyId = KEY_ID;
export const configured = Boolean(KEY_ID && KEY_SECRET);

/** True while the gateway is in test mode. Kept out of prose and read from the
 *  key itself, so it cannot be wrong. */
export const isTestMode = KEY_ID.startsWith('rzp_test_');

const enc = new TextEncoder();

export const hmacHex = async (message: string, secret = KEY_SECRET): Promise<string> => {
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signed = await crypto.subtle.sign('HMAC', key, enc.encode(message));
	return [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Constant time for equal-length inputs, and it refuses unequal lengths outright
 * rather than leaking the length through an early return that looks innocent.
 */
export const sameSignature = (a: string, b: string): boolean => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
};

export const createOrder = async (body: {
	amount: number;
	receipt: string;
	notes?: Record<string, string>;
}): Promise<{ id: string }> => {
	const res = await fetch('https://api.razorpay.com/v1/orders', {
		method: 'POST',
		headers: {
			Authorization: `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ currency: 'INR', ...body }),
	});
	if (!res.ok) {
		// The gateway's own words. They are what makes a refusal diagnosable
		// three days later without reproducing it.
		throw new Error(`razorpay ${res.status}: ${(await res.text()).slice(0, 400)}`);
	}
	return await res.json();
};

/**
 * What the gateway recorded about a payment.
 *
 * Asked for rather than accepted from the browser: the donor types their name
 * and email into the gateway's own window, which we never see, and this is the
 * only account of it that cannot have been edited on the way back.
 */
export const fetchPayment = async (
	paymentId: string,
): Promise<{ email?: string; contact?: string; notes?: Record<string, string> }> => {
	const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
		headers: { Authorization: `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}` },
	});
	if (!res.ok) {
		// Not fatal. The signature already proved the payment; this only enriches
		// the row, and a donation recorded without an email is still recorded.
		console.error(`[itti/razorpay] payment ${res.status}`);
		return {};
	}
	return await res.json();
};

/**
 * The origins allowed to ask for an order.
 *
 * The site itself, and any loopback port — a preview server picks whichever one
 * is free, and pinning a single port here means the flow can only be tested by
 * luck.
 */
const ALLOWED = new Set(['https://itti.org.in', 'https://www.itti.org.in']);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const permitted = (origin: string | null) =>
	Boolean(origin && (ALLOWED.has(origin) || LOCAL.test(origin)));

export const cors = (origin: string | null): Record<string, string> => ({
	'Access-Control-Allow-Origin': permitted(origin) ? origin! : 'https://itti.org.in',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	Vary: 'Origin',
});
