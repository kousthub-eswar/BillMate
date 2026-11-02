import { createClient } from '@supabase/supabase-js';

// Note: Vite requires static property access (import.meta.env.VITE_*) for build-time string substitution
const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL)
    || (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL);

const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY)
    || (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be defined.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get the current authenticated user's ID.
 * Used by all service layers to stamp user_id on inserts.
 */
export async function getCurrentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return user.id;
}
