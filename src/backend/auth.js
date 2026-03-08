import { supabase } from '../database/supabase';

export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

export function isAuthenticated() {
    // Synchronous check using localStorage for quick init
    // The actual session validation happens async via getSession()
    const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    return !!storageKey && !!localStorage.getItem(storageKey);
}

export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
}
