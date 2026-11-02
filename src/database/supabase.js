import { createClient } from '@supabase/supabase-js';

const getEnvVar = (name) => {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
        return import.meta.env[name];
    }
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
        return process.env[name];
    }
    return undefined;
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

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
