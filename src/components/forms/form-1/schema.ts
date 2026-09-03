/**
 * Maps Form 1 input fields to the Supabase database schema representation
 * defined in `supabase/migrations/0001_identity.sql` and `0002_health.sql`.
 *
 * NOTE: This client module handles data structuring and secure session storage
 * hand-off. It does NOT expose any Supabase service-role or secret keys.
 */
import type { Form1Data, SupabasePersonPayload } from './types';
import { normalizePhone } from './validation';

export const FORM1_STORAGE_KEY = 'itti_form1_session';

/**
 * Transforms Form 1 raw form values into the database column structure of table `person`.
 */
export function mapForm1ToSupabase(data: Form1Data): SupabasePersonPayload {
	const normalizedPhone = data.phone ? normalizePhone(data.phone) : null;
	const trimmedEmail = data.email ? data.email.trim().toLowerCase() : null;

	return {
		full_name: data.fullName.trim(),
		phone: normalizedPhone,
		email: trimmedEmail,
		date_of_birth: data.dateOfBirth ? data.dateOfBirth : null,
		gender: data.gender ? data.gender : null,
		pincode:
			data.pincode && data.pincode.trim().length === 6 ? data.pincode.trim() : null,
		preferred_language: data.preferredLanguage ? data.preferredLanguage : null,
		role: data.role ? data.role : null,
		meta: {
			city: data.city,
			state: data.state,
			selected_pillar: data.pillar || 'other',
			submitted_at: new Date().toISOString(),
			client_source: 'web_form_1',
		},
	};
}

/**
 * Saves Form 1 data to browser session storage for handoff to subsequent steps.
 */
export function persistForm1Data(data: Form1Data): SupabasePersonPayload {
	const payload = mapForm1ToSupabase(data);
	try {
		if (typeof window !== 'undefined' && window.sessionStorage) {
			window.sessionStorage.setItem(FORM1_STORAGE_KEY, JSON.stringify(payload));
		}
	} catch (e) {
		console.warn('Unable to persist to sessionStorage:', e);
	}
	return payload;
}

/**
 * Reads any saved Form 1 payload from session storage.
 */
export function getSavedForm1Payload(): SupabasePersonPayload | null {
	try {
		if (typeof window !== 'undefined' && window.sessionStorage) {
			const raw = window.sessionStorage.getItem(FORM1_STORAGE_KEY);
			if (raw) return JSON.parse(raw);
		}
	} catch (e) {
		console.warn('Unable to read from sessionStorage:', e);
	}
	return null;
}
