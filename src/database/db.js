import { supabase } from './supabase';

const DEFAULT_SETTINGS = {
    shop_name: 'My Shop',
    currency: '₹',
    low_stock_threshold: 5,
    receipt_template: `🧾 *{shop_name}*\n──────────────\n{items}\n──────────────\n*Total: {currency}{total}*\nPayment: {payment_method}\nDate: {date}\n\nThank you for shopping with us! 🙏`
};

export async function initializeSettings() {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const { data } = await supabase.from('settings').select('key').eq('key', key).single();
        if (!data) {
            await supabase.from('settings').upsert({ key, value: String(value) });
        }
    }
}

export async function getSetting(key) {
    const { data } = await supabase.from('settings').select('value').eq('key', key).single();
    return data ? data.value : (DEFAULT_SETTINGS[key] != null ? String(DEFAULT_SETTINGS[key]) : undefined);
}

export async function setSetting(key, value) {
    await supabase.from('settings').upsert({ key, value: String(value) });
}

export async function getAllSettings() {
    const { data } = await supabase.from('settings').select('*');
    const settings = {};
    (data || []).forEach(r => { settings[r.key] = r.value; });
    return { ...Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, String(v)])), ...settings };
}

// Compatibility layer so DashboardPage's `db.sales.toArray()` etc. still work
export const db = {
    sales: { async toArray() { const { data } = await supabase.from('sales').select('*'); return data || []; } },
    saleItems: { async toArray() { const { data } = await supabase.from('sale_items').select('*'); return data || []; } },
    products: { async toArray() { const { data } = await supabase.from('products').select('*'); return data || []; } },
    customers: { async toArray() { const { data } = await supabase.from('customers').select('*'); return data || []; } },
};

export { DEFAULT_SETTINGS };
