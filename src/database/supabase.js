import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://txrktvlfrbtuerabpqpe.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4cmt0dmxmcmJ0dWVyYWJwcXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTI2MDMsImV4cCI6MjA4ODUyODYwM30.skM7fnSfWFBj0JOPxDGk_YwDmUDg-2CjNKhHruQtoo8';

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
