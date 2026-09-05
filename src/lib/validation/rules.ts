/**
 * The field rules, in one place.
 *
 * These were written out three times — once in the overlay's validation, once
 * in the registration service, once in SQL — and had already drifted: the
 * overlay required a two-character TLD while the service and the database
 * accepted one, so `a@b.c` was rejected in the browser and accepted everywhere
 * else.
 *
 * The database remains the authority; `register_member` re-checks all of this
 * because the REST endpoint is reachable without ever loading the page. What
 * lives here is the same rule expressed for the browser, so that a person is
 * told what is wrong before a round trip rather than after one. When a rule
 * changes it has to change here and in the migration — two places, deliberately,
 * because one of them is the one that actually holds.
 */

export const LIMITS = {
	fullName: 120,
	city: 100,
	genderSelfDescribed: 60,
	maxAgeYears: 120,
} as const;

/** Mirrors `^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$` in SQL. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

/** Mirrors `person.phone`'s check: E.164. */
const E164 = /^\+[1-9][0-9]{7,14}$/;

/** Mirrors `person.pincode`'s check: a six-digit Indian PIN. */
const INDIAN_PINCODE = /^[1-9][0-9]{5}$/;

export const isValidEmail = (email: string): boolean => EMAIL.test(email.trim());

export const isValidE164 = (phone: string): boolean => E164.test(phone.trim());

export const isValidIndianPincode = (pincode: string): boolean =>
	INDIAN_PINCODE.test(pincode.trim());

/**
 * Puts a number into E.164. A bare ten-digit Indian mobile is assumed to be
 * Indian; anything else must already carry its country code, because guessing
 * one is how a number ends up unreachable.
 */
export const toE164 = (raw: string | undefined | null): string | null => {
	if (!raw) return null;
	const trimmed = raw.trim().replace(/[\s\-()]/g, '');
	if (!trimmed) return null;
	if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
	if (trimmed.startsWith('+')) return trimmed;
	if (/^[6-9]\d{9}$/.test(trimmed)) return `+91${trimmed}`;
	return trimmed;
};

/**
 * Mirrors `person.date_of_birth`'s check. Compared as calendar dates: a
 * `YYYY-MM-DD` string parses as UTC midnight, which is a day ahead of local
 * midnight for anyone east of Greenwich, and would otherwise call a birthday
 * of today a date in the future across most of India.
 */
export const checkDateOfBirth = (value: string): { valid: boolean; error?: string } => {
	if (!value) return { valid: true };

	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) return { valid: false, error: 'Please enter a valid date.' };

	const [, y, m, d] = match;
	const year = Number(y);
	const month = Number(m);
	const day = Number(d);

	const dob = new Date(year, month - 1, day);
	if (
		dob.getFullYear() !== year ||
		dob.getMonth() !== month - 1 ||
		dob.getDate() !== day
	) {
		return { valid: false, error: 'Please enter a valid date.' };
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	if (dob > today) {
		return { valid: false, error: 'Date of birth cannot be in the future.' };
	}

	const oldest = new Date(today);
	oldest.setFullYear(today.getFullYear() - LIMITS.maxAgeYears);
	if (dob <= oldest) {
		return {
			valid: false,
			error: `Please enter a date within the last ${LIMITS.maxAgeYears} years.`,
		};
	}

	return { valid: true };
};
