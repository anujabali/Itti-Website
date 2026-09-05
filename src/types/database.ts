/**
 * Database type definitions matching the Supabase PostgreSQL schema.
 * Source migrations:
 * - supabase/migrations/0001_identity.sql
 * - supabase/migrations/0002_health.sql
 */

export type RoleKind = 'patient' | 'caregiver' | 'volunteer' | 'other';

export type GenderKind =
	'woman' | 'man' | 'non_binary' | 'self_described' | 'undisclosed';

export type ContactChannel = 'whatsapp' | 'sms' | 'email' | 'push';

export type HeardFrom =
	| 'friend_family'
	| 'doctor_hospital'
	| 'event'
	| 'podcast'
	| 'instagram'
	| 'youtube'
	| 'whatsapp_group'
	| 'search'
	| 'news'
	| 'volunteer_staff'
	| 'other';

export type PillarKind =
	'neurodivergence' | 'cancer_care' | 'claw' | 'not_sure' | 'other';

/**
 * person table — basic user identity and registration information.
 */
export type Person = {
	id: string; // uuid primary key
	auth_user_id: string | null; // uuid, nullable if auth is not used yet

	// Mandatory fields (Form 1)
	full_name: string; // TEXT NOT NULL, 1 to 120 chars
	city: string; // TEXT NOT NULL, 1 to 100 chars
	role: RoleKind; // ENUM NOT NULL

	// Reachability constraint: phone IS NOT NULL OR email IS NOT NULL
	phone: string | null; // E.164 format: e.g. +919876543210
	email: string | null;
	phone_verified_at: string | null;
	email_verified_at: string | null;

	// Optional fields (Form 1)
	date_of_birth: string | null; // YYYY-MM-DD
	gender: GenderKind | null;
	gender_self_described: string | null;
	pincode: string | null; // 6-digit Indian PIN: e.g. 600001
	preferred_language: string | null; // BCP-47: 'ta', 'hi', 'en-IN'

	// Communication consents & channel
	contact_preferred: ContactChannel | null;
	consent_whatsapp: boolean | null;
	consent_sms: boolean | null;
	consent_email: boolean | null;

	// Referral tracking
	heard_from: HeardFrom | null;
	heard_from_other: string | null;
	referrer_name: string | null;
	referrer_code: string | null;
	utm: Record<string, unknown>;
	assisted_by: string | null;

	created_at: string;
	updated_at: string;
};

export type PersonInsert = Omit<Person, 'id' | 'created_at' | 'updated_at'> & {
	id?: string;
	created_at?: string;
	updated_at?: string;
};

/**
 * subject table — links intake/pillar data to a person
 */
export type Subject = {
	id: string; // uuid
	person_id: string; // uuid references person.id
	relationship: 'self' | 'cared_for';
	created_at: string;
};

export type SubjectInsert = Omit<Subject, 'id' | 'created_at'> & {
	id?: string;
	created_at?: string;
};

/**
 * health_intake table — records area/pillar and subsequent stage-two intake
 */
export type HealthIntake = {
	id: number;
	subject_id: string;
	version: number;
	pillar: PillarKind | null;
	ailment_code: string | null;
	ailment_other: string | null;
	status: string | null;
	modalities: string[];
	modality_other: string | null;
	diagnosis_year: number | null;
	under_medical_supervision: boolean | null;
	source: 'self' | 'staff_assisted' | 'import';
	recorded_by: string | null;
	created_at: string;
};

export type HealthIntakeInsert = Omit<HealthIntake, 'id' | 'version' | 'created_at'> & {
	id?: number;
	version?: number;
	created_at?: string;
};

export type ConsentRecord = {
	id: number;
	person_id: string;
	purpose: string; // 'account' | 'privacy_policy' | 'whatsapp' | 'sms' | 'email'
	granted: boolean;
	policy_version: string; // e.g. 'v1.0'
	channel: 'web' | 'in_person' | 'phone';
	granted_by: string | null;
	created_at: string;
};

export type ConsentRecordInsert = Omit<ConsentRecord, 'id' | 'created_at'> & {
	id?: number;
	created_at?: string;
};

/**
 * Payload submitted by Form 1 (Basic user identity & registration).
 */
export interface Form1RegistrationPayload {
	// Mandatory fields
	fullName: string;
	city: string;
	role: RoleKind; // 'patient' | 'caregiver' | 'volunteer' | 'other'

	// At least one of phone or email MUST be provided
	phone?: string;
	email?: string;

	// Optional Area/Pillar selection ("Which area would you like to connect with?")
	selectedPillar?: PillarKind; // 'neurodivergence' | 'cancer_care' | 'claw' | 'not_sure'

	// Optional identity fields
	dateOfBirth?: string; // YYYY-MM-DD
	gender?: GenderKind;
	genderSelfDescribed?: string;
	pincode?: string; // 6-digit Indian postal PIN
	preferredLanguage?: string; // 'en-IN', 'ta', 'hi', etc.


	// Communication Preferences
	preferredContactChannel?: ContactChannel;
	consentWhatsapp?: boolean;
	consentSms?: boolean;
	consentEmail?: boolean;

	// Acquisition / Referral
	heardFrom?: HeardFrom;
	heardFromOther?: string;
	referrerName?: string;
	referrerCode?: string;
	utm?: Record<string, string>;

	// Policy acceptance
	policyVersion?: string; // defaults to 'v1.0'
}

/**
 * Backward compatibility alias for MemberRegistrationPayload
 */
export type MemberRegistrationPayload = Form1RegistrationPayload;

/**
 * Result returned by the registration service / API.
 */
export interface RegistrationResult {
	success: boolean;
	personId?: string;
	authUserId?: string;
	subjectId?: string;
	message: string;
	errors?: Record<string, string>;
	isMock?: boolean;
}

/**
 * What `register_member` returns. Ids only, so a refusal and a success travel
 * the same path and neither carries anybody's details back to the browser.
 */
export interface RegisterMemberResult {
	ok: boolean;
	personId?: string;
	subjectId?: string | null;
	field?: string;
	message?: string;
}

/**
 * Complete Database Schema for Supabase client typing
 */
export interface Database {
	public: {
		Tables: {
			person: {
				Row: Person;
				Insert: PersonInsert;
				Update: Partial<PersonInsert>;
				Relationships: [];
			};
			subject: {
				Row: Subject;
				Insert: SubjectInsert;
				Update: Partial<SubjectInsert>;
				Relationships: [];
			};
			health_intake: {
				Row: HealthIntake;
				Insert: HealthIntakeInsert;
				Update: Partial<HealthIntakeInsert>;
				Relationships: [];
			};
			consent_record: {
				Row: ConsentRecord;
				Insert: ConsentRecordInsert;
				Update: Partial<ConsentRecordInsert>;
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: {
			register_member: {
				Args: { payload: Record<string, unknown> };
				Returns: RegisterMemberResult;
			};
			person_age: {
				Args: { p: Person };
				Returns: number;
			};
			person_is_minor: {
				Args: { p: Person };
				Returns: boolean;
			};
			has_consent: {
				Args: { p_person: string; p_purpose: string };
				Returns: boolean;
			};
		};
		CompositeTypes: Record<string, never>;
		Enums: {
			role_kind: RoleKind;
			gender_kind: GenderKind;
			contact_channel: ContactChannel;
			heard_from: HeardFrom;
			pillar_kind: PillarKind;
		};
	};
}
