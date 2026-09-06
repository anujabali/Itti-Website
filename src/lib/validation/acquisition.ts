/**
 * Where a visit came from.
 *
 * 0001 asks for self-report and campaign tags both, "because each catches what
 * the other misses: UTM is accurate but blind to offline word of mouth". This
 * is the accurate half — read from the URL the page was opened with, so it
 * costs the person filling the form nothing.
 *
 * Nothing here is read from a cookie or a third party, and nothing is kept for
 * a visitor who does not register: it is gathered at submit and travels with
 * the registration or not at all.
 */

const UTM_KEYS = [
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
] as const;

/** Long enough to be a real tag, short enough not to be a payload. */
const MAX_VALUE = 120;

export interface Acquisition {
	utm?: Record<string, string>;
	referrerCode?: string;
}

export const readAcquisition = (): Acquisition => {
	if (typeof window === 'undefined') return {};

	try {
		const params = new URLSearchParams(window.location.search);
		const utm: Record<string, string> = {};

		for (const key of UTM_KEYS) {
			const value = params.get(key)?.trim();
			if (value) utm[key] = value.slice(0, MAX_VALUE);
		}

		// The first referrer that is not this site, so we can tell a link from a
		// search from someone typing the address. The full URL is not kept — only
		// the host, which is the part that answers the question.
		const referrer = document.referrer;
		if (referrer) {
			try {
				const host = new URL(referrer).hostname;
				if (host && host !== window.location.hostname) utm.referrer = host;
			} catch {
				/* a referrer we cannot parse tells us nothing */
			}
		}

		const code = (params.get('ref') || params.get('referral'))?.trim();

		return {
			...(Object.keys(utm).length > 0 ? { utm } : {}),
			...(code ? { referrerCode: code.slice(0, MAX_VALUE) } : {}),
		};
	} catch {
		// A URL we cannot read is not worth failing a registration over.
		return {};
	}
};
