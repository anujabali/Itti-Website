import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const env =
	typeof import.meta !== 'undefined' && 'env' in import.meta
		? (import.meta as { env?: Record<string, string> }).env
		: undefined;

const supabaseUrl =
	env?.PUBLIC_SUPABASE_URL ||
	(typeof process !== 'undefined' ? process.env?.PUBLIC_SUPABASE_URL : '') ||
	'';

const supabaseAnonKey =
	env?.PUBLIC_SUPABASE_ANON_KEY ||
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
		);
		return clientInstance;
	}

	clientInstance = createClient<Database>(supabaseUrl, supabaseAnonKey);
	return clientInstance;
};

export const supabase = getSupabase();
