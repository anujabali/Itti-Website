import { supabase, isSupabaseConfigured } from '../supabase';
import {
	LIMITS,
	checkDateOfBirth,
	isValidE164,
	isValidEmail,
	isValidIndianPincode,
	toE164,
} from '../validation/rules';
import type {
	Form1RegistrationPayload,
	RegistrationResult,
	ConsentRecordInsert,
	RoleKind,
	PillarKind,
} from '../../types/database';

const VALID_ROLES: RoleKind[] = ['patient', 'caregiver', 'volunteer', 'other'];
const VALID_PILLARS: PillarKind[] = [
	'neurodivergence',
	'cancer_care',
	'claw',
	'not_sure',
	'other',
];

/** Kept as a named export; the rule itself lives in `lib/validation/rules`. */
export const formatPhoneNumber = (phone?: string): string | null => toE164(phone);

/**
 * Validates Form 1 registration inputs before submission.
 * Enforces mandatory fields:
 * - full_name (NOT NULL)
 * - city (NOT NULL)
 * - role (NOT NULL)
 * - phone IS NOT NULL OR email IS NOT NULL
 */
export const validateMemberPayload = (
	payload: Form1RegistrationPayload,
): { valid: boolean; errors: Record<string, string> } => {
	const errors: Record<string, string> = {};

	// 1. Mandatory field: full_name
	const trimmedName = payload.fullName?.trim() || '';
	if (!trimmedName) {
		errors.fullName = 'Full name is required.';
	} else if (trimmedName.length > LIMITS.fullName) {
		errors.fullName = `Full name must be ${LIMITS.fullName} characters or fewer.`;
	}

	// 2. Mandatory field: city
	const trimmedCity = payload.city?.trim() || '';
	if (!trimmedCity) {
		errors.city = 'City is required.';
	} else if (trimmedCity.length > LIMITS.city) {
		errors.city = `City must be ${LIMITS.city} characters or fewer.`;
	}

	// 3. Mandatory field: role
	if (!payload.role) {
		errors.role = 'Please select a role.';
	} else if (!VALID_ROLES.includes(payload.role)) {
		errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}.`;
	}

	// 4. Reachability constraint: at least one of phone or email must be provided
	const hasEmail = Boolean(payload.email && payload.email.trim());
	const formattedPhone = formatPhoneNumber(payload.phone);

	if (!hasEmail && !formattedPhone) {
		errors.contact = 'At least one of phone or email must be provided.';
	}

	if (hasEmail && !isValidEmail(payload.email!)) {
		errors.email = 'Please provide a valid email address.';
	}

	if (formattedPhone && !isValidE164(formattedPhone)) {
		errors.phone =
			'Phone number must be valid with country code (e.g. +91 9876543210).';
	}

	if (payload.pincode?.trim() && !isValidIndianPincode(payload.pincode)) {
		errors.pincode =
			'Pincode must be a valid 6-digit Indian postal code (e.g. 600001).';
	}

	if (payload.dateOfBirth) {
		const dob = checkDateOfBirth(payload.dateOfBirth);
		if (!dob.valid && dob.error) errors.dateOfBirth = dob.error;
	}

	// Optional: Self-described gender check
	if (payload.gender === 'self_described' && !payload.genderSelfDescribed?.trim()) {
		errors.genderSelfDescribed = 'Please specify your gender identity.';
	}

	// Optional: Area/Pillar selection check
	if (payload.selectedPillar && !VALID_PILLARS.includes(payload.selectedPillar)) {
		errors.selectedPillar = `Selected area must be one of: ${VALID_PILLARS.join(', ')}.`;
	}

	// Optional: Heard from other check
	if (payload.heardFrom === 'other' && !payload.heardFromOther?.trim()) {
		errors.heardFromOther = 'Please specify how you heard about us.';
	}

	return {
		valid: Object.keys(errors).length === 0,
		errors,
	};
};

/**
 * Registers a visitor (Form 1).
 *
 * The whole write is one call to the `register_member` database function. That
 * function runs as its owner, so the tables themselves stay closed to anonymous
 * visitors — see 0004. It validates everything again on its own side, because
 * the REST endpoint is reachable without ever loading this page, and it returns
 * ids only, never a row of anybody's details.
 */
export const registerMember = async (
	payload: Form1RegistrationPayload,
): Promise<RegistrationResult> => {
	const validation = validateMemberPayload(payload);
	if (!validation.valid) {
		return {
			success: false,
			message: 'Please check the highlighted fields.',
			errors: validation.errors,
		};
	}

	// Local development without a project of your own. Never in a build: a
	// misconfigured deploy has to fail loudly rather than thank people for
	// details it quietly dropped.
	if (!isSupabaseConfigured()) {
		if (!import.meta.env.DEV) {
			return {
				success: false,
				message: 'We could not reach the registry just now. Please try again shortly.',
				errors: { config: 'Supabase environment variables are not set for this build.' },
			};
		}

		console.info('[itti/registration] mock submit — no Supabase configured', {
			city: payload.city,
			role: payload.role,
			selectedPillar: payload.selectedPillar ?? null,
		});

		return {
			success: true,
			isMock: true,
			personId: `mock-person-${Math.random().toString(36).slice(2, 9)}`,
			message: 'Registration recorded (local mock — nothing was saved).',
		};
	}

	try {
		// An optional account. Done first so the row the function writes is bound
		// to the auth user via auth.uid(), rather than the client asserting an id
		// it could just as easily make up.
		if (payload.password) {
			const email = payload.email?.toLowerCase().trim();
			if (!email) {
				return {
					success: false,
					message: 'An email address is needed to create an account.',
					errors: { email: 'An email address is needed to create an account.' },
				};
			}

			const { data: session } = await supabase.auth.getUser();
			if (!session.user) {
				const { error: authError } = await supabase.auth.signUp({
					email,
					password: payload.password,
					options: { data: { full_name: payload.fullName.trim() } },
				});

				if (authError) {
					return {
						success: false,
						message: authError.message,
						errors: { auth: authError.message },
					};
				}
			}
		}

		const { data, error } = await supabase.rpc('register_member', {
			payload: {
				fullName: payload.fullName.trim(),
				city: payload.city.trim(),
				role: payload.role,
				phone: formatPhoneNumber(payload.phone),
				email: payload.email?.toLowerCase().trim() || null,
				dateOfBirth: payload.dateOfBirth || null,
				gender: payload.gender || null,
				genderSelfDescribed: payload.genderSelfDescribed?.trim() || null,
				pincode: payload.pincode?.trim() || null,
				preferredLanguage: payload.preferredLanguage || null,
				preferredContactChannel: payload.preferredContactChannel || null,
				consentWhatsapp: payload.consentWhatsapp ?? null,
				consentSms: payload.consentSms ?? null,
				consentEmail: payload.consentEmail ?? null,
				heardFrom: payload.heardFrom || null,
				heardFromOther: payload.heardFromOther?.trim() || null,
				referrerName: payload.referrerName?.trim() || null,
				referrerCode: payload.referrerCode?.trim() || null,
				utm: payload.utm || {},
				policyVersion: payload.policyVersion || 'v1.0',
			},
		});

		if (error) {
			// Transport or permission failure. The detail goes to the console for
			// whoever is debugging; the visitor gets a sentence they can act on.
			console.error('[itti/registration]', error);
			return {
				success: false,
				message: 'We could not save that just now. Please try again shortly.',
				errors: { server: error.message },
			};
		}

		// The function reports its own refusals in the payload, so that a bad
		// field arrives as a field error rather than as a 500.
		if (!data?.ok) {
			const field = data?.field || 'form';
			const message = data?.message || 'Please check your details and try again.';
			return { success: false, message, errors: { [field]: message } };
		}

		return {
			success: true,
			personId: data.personId,
			subjectId: data.subjectId ?? undefined,
			message: 'Thank you — you are on our list.',
		};
	} catch (err: unknown) {
		console.error('[itti/registration]', err);
		return {
			success: false,
			message: 'Something went wrong on our side. Please try again shortly.',
			errors: { server: err instanceof Error ? err.message : 'Unknown error' },
		};
	}
};
