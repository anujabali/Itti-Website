import { supabase, isSupabaseConfigured } from '../supabase';
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

/**
 * Normalizes Indian phone numbers into E.164 format (+91XXXXXXXXXX).
 * If already E.164 (+...), keeps it as is.
 */
export const formatPhoneNumber = (phone?: string): string | null => {
	if (!phone) return null;
	const trimmed = phone.trim().replace(/[\s-()]/g, '');
	if (!trimmed) return null;

	if (trimmed.startsWith('+')) {
		return trimmed;
	}

	// If 10 digits provided (e.g. 9876543210), default to Indian country code +91
	if (/^[6-9]\d{9}$/.test(trimmed)) {
		return `+91${trimmed}`;
	}

	return trimmed;
};

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
	} else if (trimmedName.length > 120) {
		errors.fullName = 'Full name must be 120 characters or fewer.';
	}

	// 2. Mandatory field: city
	const trimmedCity = payload.city?.trim() || '';
	if (!trimmedCity) {
		errors.city = 'City is required.';
	} else if (trimmedCity.length > 100) {
		errors.city = 'City must be 100 characters or fewer.';
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

	// Validate email format if provided
	if (hasEmail) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(payload.email!.trim())) {
			errors.email = 'Please provide a valid email address.';
		}
	}

	// Validate phone format if provided
	if (formattedPhone) {
		const e164Regex = /^\+[1-9][0-9]{7,14}$/;
		if (!e164Regex.test(formattedPhone)) {
			errors.phone =
				'Phone number must be valid with country code (e.g. +91 9876543210).';
		}
	}

	// Optional: PIN code check (6-digit Indian PIN)
	if (payload.pincode && payload.pincode.trim()) {
		const pin = payload.pincode.trim();
		if (!/^[1-9][0-9]{5}$/.test(pin)) {
			errors.pincode =
				'Pincode must be a valid 6-digit Indian postal code (e.g. 600001).';
		}
	}

	// Optional: Date of birth check
	if (payload.dateOfBirth) {
		const dob = new Date(payload.dateOfBirth);
		const now = new Date();
		const minDate = new Date();
		minDate.setFullYear(now.getFullYear() - 120);

		if (isNaN(dob.getTime())) {
			errors.dateOfBirth = 'Invalid date of birth.';
		} else if (dob > now) {
			errors.dateOfBirth = 'Date of birth cannot be in the future.';
		} else if (dob < minDate) {
			errors.dateOfBirth = 'Date of birth cannot be more than 120 years ago.';
		}
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
 * Registers basic user identity (Form 1) into the Supabase database.
 * 1. Validates mandatory and optional fields.
 * 2. Authenticates (optional if auth is not being used yet).
 * 3. Inserts row into `person` table.
 * 4. If selectedPillar is provided, creates `subject` and initial `health_intake`
 *    record storing the area in the intake/pillar structure without medical questions.
 * 5. Logs audit entry in `consent_record`.
 */
export const registerMember = async (
	payload: Form1RegistrationPayload,
): Promise<RegistrationResult> => {
	// 1. Client-side input validation
	const validation = validateMemberPayload(payload);
	if (!validation.valid) {
		return {
			success: false,
			message: 'Validation failed. Please check form inputs.',
			errors: validation.errors,
		};
	}

	const formattedPhone = formatPhoneNumber(payload.phone);
	const normalizedEmail = payload.email?.toLowerCase().trim() || null;
	const policyVersion = payload.policyVersion || 'v1.0';

	// 2. Dev / Mock Fallback if Supabase credentials are not yet configured in .env
	if (!isSupabaseConfigured()) {
		console.info('[@itti/registration] Mock Form 1 Registration Executed:', {
			fullName: payload.fullName,
			city: payload.city,
			role: payload.role,
			email: normalizedEmail,
			phone: formattedPhone,
			selectedPillar: payload.selectedPillar || 'not specified',
		});

		return {
			success: true,
			isMock: true,
			personId: `mock-person-${Math.random().toString(36).substring(2, 9)}`,
			authUserId: payload.password
				? `mock-auth-${Math.random().toString(36).substring(2, 9)}`
				: undefined,
			subjectId: payload.selectedPillar
				? `mock-subject-${Math.random().toString(36).substring(2, 9)}`
				: undefined,
			message: 'Form 1 registered successfully (Development Mock Mode).',
		};
	}

	try {
		// 3. Optional Authentication
		let authUserId: string | null = null;

		// Check if user is already signed in
		const { data: sessionData } = await supabase.auth.getUser();
		if (sessionData.user) {
			authUserId = sessionData.user.id;
		} else if (normalizedEmail && payload.password) {
			// Sign up new auth user if password is provided
			const { data: authData, error: authError } = await supabase.auth.signUp({
				email: normalizedEmail,
				password: payload.password,
				options: {
					data: {
						full_name: payload.fullName.trim(),
					},
				},
			});

			if (authError) {
				return {
					success: false,
					message: authError.message,
					errors: { auth: authError.message },
				};
			}

			authUserId = authData.user?.id || null;
		}

		// 4. Insert into `person` table (auth_user_id is nullable if auth is not being used yet)
		const { data: personData, error: personError } = await supabase
			.from('person')
			.insert({
				auth_user_id: authUserId,
				full_name: payload.fullName.trim(),
				city: payload.city.trim(),
				role: payload.role,
				phone: formattedPhone,
				email: normalizedEmail,
				date_of_birth: payload.dateOfBirth || null,
				gender: payload.gender || null,
				gender_self_described:
					payload.gender === 'self_described'
						? payload.genderSelfDescribed?.trim() || null
						: null,
				pincode: payload.pincode?.trim() || null,
				preferred_language: payload.preferredLanguage || null,
				contact_preferred: payload.preferredContactChannel || null,
				consent_whatsapp: payload.consentWhatsapp ?? null,
				consent_sms: payload.consentSms ?? null,
				consent_email: payload.consentEmail ?? null,
				heard_from: payload.heardFrom || null,
				heard_from_other:
					payload.heardFrom === 'other' ? payload.heardFromOther?.trim() || null : null,
				referrer_name: payload.referrerName?.trim() || null,
				referrer_code: payload.referrerCode?.trim() || null,
				utm: payload.utm || {},
			})
			.select('id')
			.single();

		if (personError) {
			let errorMsg = personError.message;
			if (
				personError.code === '23505' ||
				personError.message.includes('unique constraint') ||
				personError.message.includes('duplicate key')
			) {
				if (personError.message.includes('phone')) {
					errorMsg = 'This mobile number is already registered with us. Your registration is already on file!';
				} else if (personError.message.includes('email')) {
					errorMsg = 'This email address is already registered with us. Your registration is already on file!';
				} else {
					errorMsg = 'A record with this contact information is already registered with us.';
				}
			}
			return {
				success: false,
				message: errorMsg,
				errors: { database: errorMsg },
			};
		}

		const personId = personData.id;
		let subjectId: string | undefined;

		// 5. Area/Pillar selection: store in existing intake/pillar structure (subject + health_intake)
		// without any clinical/medical questions
		if (payload.selectedPillar) {
			const { data: subjectData, error: subjectError } = await supabase
				.from('subject')
				.insert({
					person_id: personId,
					relationship: 'self',
				})
				.select('id')
				.single();

			if (subjectError) {
				console.warn('[@itti/registration] Subject creation error:', subjectError);
			} else if (subjectData) {
				subjectId = subjectData.id;
				const { error: intakeError } = await supabase.from('health_intake').insert({
					subject_id: subjectId,
					pillar: payload.selectedPillar,
					modalities: [],
					source: 'self',
				});

				if (intakeError) {
					console.warn(
						'[@itti/registration] Initial intake creation error:',
						intakeError,
					);
				}
			}
		}

		// 6. Record consents in `consent_record` audit table
		const consentsToInsert: ConsentRecordInsert[] = [
			{
				person_id: personId,
				purpose: 'account',
				granted: true,
				policy_version: policyVersion,
				channel: 'web',
				granted_by: authUserId,
			},
		];

		if (payload.consentWhatsapp) {
			consentsToInsert.push({
				person_id: personId,
				purpose: 'whatsapp',
				granted: true,
				policy_version: policyVersion,
				channel: 'web',
				granted_by: authUserId,
			});
		}

		if (payload.consentEmail) {
			consentsToInsert.push({
				person_id: personId,
				purpose: 'email',
				granted: true,
				policy_version: policyVersion,
				channel: 'web',
				granted_by: authUserId,
			});
		}

		if (payload.consentSms) {
			consentsToInsert.push({
				person_id: personId,
				purpose: 'sms',
				granted: true,
				policy_version: policyVersion,
				channel: 'web',
				granted_by: authUserId,
			});
		}

		const { error: consentError } = await supabase
			.from('consent_record')
			.insert(consentsToInsert);

		if (consentError) {
			console.warn('[@itti/registration] Consent record log error:', consentError);
		}

		return {
			success: true,
			personId,
			authUserId: authUserId || undefined,
			subjectId,
			message: 'Registration completed successfully!',
		};
	} catch (err: unknown) {
		const errorMsg =
			err instanceof Error ? err.message : 'Unknown registration error occurred';
		return {
			success: false,
			message: errorMsg,
			errors: { server: errorMsg },
		};
	}
};
