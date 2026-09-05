/**
 * The Itti Foundation — Form 1 (Basic Information / Get Started)
 * Type definitions & database contract interfaces.
 */

export type RoleKind = 'patient' | 'caregiver' | 'supporter' | 'other';
export type GenderKind =
	| 'woman'
	| 'man'
	| 'non_binary'
	| 'self_described'
	| 'undisclosed';
export type PillarKind = 'neurodivergence' | 'cancer_care' | 'claw' | 'other';
export type PreferredLanguage = 'en' | 'hi' | 'mr' | 'gu' | 'bn' | 'ta' | 'te' | 'kn' | 'ml' | 'pa' | 'ur' | 'or' | 'as' | 'other';

export interface Form1Data {
	fullName: string;
	phone: string;
	countryIso2: string;
	email: string;
	dateOfBirth: string;
	gender: GenderKind | '';
	genderSelfDescribed?: string;
	city: string;
	state: string;
	pincode: string;
	preferredLanguage: PreferredLanguage | '';
	languageOther?: string;
	role: RoleKind | '';
	pillar: PillarKind | '';
	// Separate consents because they are separate consents in law, and separate
	// columns on `person`. Absent means not given, never assumed.
	consentWhatsapp: boolean;
	consentSms: boolean;
	consentEmail: boolean;
}

export type Form1Field = keyof Form1Data;

export interface Form1Errors {
	fullName?: string;
	contact?: string; // Mutual phone or email error
	phone?: string;
	email?: string;
	dateOfBirth?: string;
	gender?: string;
	city?: string;
	pincode?: string;
	role?: string;
	pillar?: string;
}

export interface CityOption {
	city: string;
	state: string;
	keywords?: string[];
}

/**
 * Payload mapping directly to the `person` table in `supabase/migrations/0001_identity.sql`
 * and pillar context for subsequent health intake in `0002_health.sql`.
 */
export interface SupabasePersonPayload {
	full_name: string;
	phone: string | null;
	email: string | null;
	date_of_birth: string | null;
	gender: GenderKind | null;
	pincode: string | null;
	preferred_language: string | null;
	role: RoleKind | null;
	meta: {
		city: string;
		state: string;
		selected_pillar: PillarKind;
		submitted_at: string;
		client_source: 'web_form_1';
	};
}
