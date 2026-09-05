/**
 * Validation logic for Form 1 (Basic Information / Get Started).
 * Corresponds directly to Supabase check constraints defined in `supabase/migrations/0001_identity.sql`.
 */
import type { Form1Data, Form1Errors } from './types';

/**
 * Normalizes a phone number string to an E.164-compatible format.
 * Country-specific calling codes are combined with local numbers in Form1Overlay before validation.
 */
export function normalizePhone(raw: string): string {
	const cleaned = raw.replace(/[^\d+]/g, '');
	if (!cleaned) return '';
	return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

export function isValidPhone(phone: string): boolean {
	const normalized = normalizePhone(phone);
	return /^\+[1-9]\d{7,14}$/.test(normalized);
}

/**
 * Validates email format.
 */
export function isValidEmail(email: string): boolean {
	const trimmed = email.trim();
	if (!trimmed) return false;
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
	return emailRegex.test(trimmed);
}

/**
 * Validates Indian 6-digit postal pincode.
 * Matches SQL: pincode ~ '^[1-9][0-9]{5}$'
 */
export function isValidPincode(pincode: string): boolean {
	const trimmed = pincode.trim();
	return /^[1-9]\d{5}$/.test(trimmed);
}

/**
 * Validates date of birth string (YYYY-MM-DD).
 * Matches SQL: date_of_birth > current_date - interval '120 years' and date_of_birth <= current_date
 */
export function isValidDateOfBirth(dobStr: string): { valid: boolean; error?: string } {
	if (!dobStr) return { valid: false, error: 'Date of birth is required.' };
	const dob = new Date(dobStr);
	if (isNaN(dob.getTime())) {
		return { valid: false, error: 'Please enter a valid date.' };
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	if (dob > today) {
		return { valid: false, error: 'Date of birth cannot be in the future.' };
	}

	const minDate = new Date();
	minDate.setFullYear(today.getFullYear() - 120);
	if (dob < minDate) {
		return { valid: false, error: 'Please enter a date within the last 120 years.' };
	}

	return { valid: true };
}

/**
 * Validates all fields of Form 1.
 * Returns { isValid: boolean, errors: Form1Errors }
 */
export function validateForm1(data: Form1Data): {
	isValid: boolean;
	errors: Form1Errors;
} {
	const errors: Form1Errors = {};

	// 1. Full Name * (length between 1 and 120)
	const trimmedName = data.fullName.trim();
	if (!trimmedName) {
		errors.fullName = 'Full name is required.';
	} else if (trimmedName.length > 120) {
		errors.fullName = 'Full name must be 120 characters or fewer.';
	}

	// 2 & 3. Phone OR Email validation rule
	// At least ONE must be provided.
	const hasPhone = Boolean(data.phone && data.phone.trim().length > 0);
	const hasEmail = Boolean(data.email && data.email.trim().length > 0);

	if (!hasPhone && !hasEmail) {
		errors.contact =
			'Please provide at least one contact method (phone number or email).';
	} else {
		if (hasPhone && !isValidPhone(data.phone)) {
			errors.phone = 'Please enter a valid phone number for the selected country.';
		}
		if (hasEmail && !isValidEmail(data.email)) {
			errors.email = 'Please enter a valid email address.';
		}
	}

	// 4. Date of Birth (Required)
	if (!data.dateOfBirth) {
		errors.dateOfBirth = 'Date of birth is required.';
	} else {
		const dobCheck = isValidDateOfBirth(data.dateOfBirth);
		if (!dobCheck.valid && dobCheck.error) {
			errors.dateOfBirth = dobCheck.error;
		}
	}

	// 6. City * (Required)
	if (!data.city || !data.city.trim()) {
		errors.city = 'Please search and select your city.';
	}

	// 7. Pincode (Required)
	if (!data.pincode || !data.pincode.trim()) {
		errors.pincode = 'Pincode is required.';
	} else if (!isValidPincode(data.pincode)) {
		errors.pincode = 'Pincode must be a 6-digit Indian postal code (e.g. 411001).';
	}

	// Gender (Required)
	if (!data.gender) {
		errors.gender = 'Please select your gender.';
	}

	// 9. I am joining as * (Required)
	if (!data.role) {
		errors.role = 'Please select how you are joining the foundation.';
	}

	// 10. Area of Interest * (Required)
	if (!data.pillar) {
		errors.pillar = 'Please select which area you would like to connect with.';
	}

	const isValid = Object.keys(errors).length === 0;
	return { isValid, errors };
}
