import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl =
	import.meta.env.PUBLIC_SUPABASE_URL ||
	(typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_URL : '') ||
	'';

const supabaseAnonKey =
	import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
	(typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_ANON_KEY : '') ||
	'';

/**
 * Returns true if real Supabase environment variables are provided.
 */
export const isSupabaseConfigured = (): boolean => {
	return Boolean(
		supabaseUrl &&
		supabaseAnonKey &&
		!supabaseUrl.includes('your-project-id') &&
		!supabaseAnonKey.includes('your-anon-key'),
	);
};

/**
 * Sign-in is a link sent to an email address, and people read email on whatever
 * device is nearest. The implicit flow puts the session in the URL fragment, so
 * a link asked for on a laptop still works when it is opened on a phone.
 *
 * PKCE would not: it holds a verifier in the browser that asked, and a link
 * opened anywhere else fails with nothing useful to say. It is the safer flow
 * where a redirect passes through a server, and this one does not — the
 * fragment never leaves the browser.
 *
 * `implicit` is the library's default today. It is named here anyway, because
 * a default that changes under a version bump would break sign-in for exactly
 * the people who cannot tell us why.
 */
const AUTH = {
	flowType: 'implicit',
	detectSessionInUrl: true,
	persistSession: true,
	autoRefreshToken: true,
} as const;

let clientInstance: SupabaseClient<Database> | null = null;

/**
 * Get or initialize the Supabase client instance.
 * If credentials are missing, returns a dummy client to avoid crashing development.
 */
export const getSupabase = (): SupabaseClient<Database> => {
	if (clientInstance) {
		return clientInstance;
	}

	if (!isSupabaseConfigured()) {
		console.warn(
			'[@itti/supabase] Supabase credentials are not set in .env. Falling back to development mock mode.',
		);
		// Initialize with dummy placeholder so createClient doesn't throw a URL parsing error
		clientInstance = createClient<Database>(
			supabaseUrl || 'https://mock-itti-project.supabase.co',
			supabaseAnonKey || 'mock-anon-key',
			{ auth: AUTH },
		);
		return clientInstance;
	}

	clientInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: AUTH });
	return clientInstance;
};

export const supabase = getSupabase();
