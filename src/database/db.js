import { supabase, getCurrentUserId } from './supabase';

const DEFAULT_SETTINGS = {
    shop_name: 'My Shop',
    currency: '₹',
    low_stock_threshold: 5,
    upi_id: 'merchant@upi',
    receipt_template: `🧾 *{shop_name}*\n──────────────\n{items}\n──────────────\n*Total: {currency}{total}*\nPayment: {payment_method}\nDate: {date}\n\nThank you for shopping with us! 🙏`
};

export async function initializeSettings() {
    const userId = await getCurrentUserId();
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const { data } = await supabase.from('settings').select('key').eq('key', key).eq('user_id', userId).single();
        if (!data) {
            await supabase.from('settings').upsert({ key, value: String(value), user_id: userId });
        }
    }
}

export async function getSetting(key) {
    const userId = await getCurrentUserId();
    const { data } = await supabase.from('settings').select('value').eq('key', key).eq('user_id', userId).single();
    return data ? data.value : (DEFAULT_SETTINGS[key] != null ? String(DEFAULT_SETTINGS[key]) : undefined);
}

export async function setSetting(key, value) {
    const userId = await getCurrentUserId();
    await supabase.from('settings').upsert({ key, value: String(value), user_id: userId });
}

export async function getAllSettings() {
    const userId = await getCurrentUserId();
    const { data } = await supabase.from('settings').select('*').eq('user_id', userId);
    const settings = {};
    (data || []).forEach(r => { settings[r.key] = r.value; });
    return { ...Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, String(v)])), ...settings };
}

export { DEFAULT_SETTINGS };
