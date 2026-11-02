import { db, generateUUID } from './db';
import { getActiveUserId } from './offlineAuth';

export const DEFAULT_SETTINGS = {
    shop_name: 'My Shop',
    shop_phone: '',
    shop_address: '',
    currency: '₹',
    low_stock_threshold: 5,
    upi_id: 'merchant@upi',
    receipt_template: `🧾 *{shop_name}*\n──────────────\n{items}\n──────────────\n*Total: {currency}{total}*\nPayment: {payment_method}\nDate: {date}\n\nThank you for shopping with us! 🙏`
};

export async function initializeSettings() {
    const userId = await getActiveUserId();
    if (!userId) return;

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        const existing = await db.settings.get(key);
        if (!existing) {
            await db.settings.put({
                key,
                user_id: userId,
                value: String(value),
                sync_status: 'SYNCED'
            });
        }
    }
}

export async function getSetting(key) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const record = await db.settings.get(key);
    if (record) return record.value;
    return DEFAULT_SETTINGS[key] != null ? String(DEFAULT_SETTINGS[key]) : undefined;
}

export async function setSetting(key, value) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');
    const now = new Date().toISOString();

    await db.transaction('rw', [db.settings, db.sync_queue], async () => {
        await db.settings.put({
            key,
            user_id: userId,
            value: String(value),
            sync_status: 'PENDING'
        });

        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'settings',
            action: 'UPDATE',
            entity_uuid: key,
            payload: { key, value: String(value), user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });
}

export async function getAllSettings() {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const records = await db.settings.where('user_id').equals(userId).toArray();
    const settings = {};
    records.forEach(r => { settings[r.key] = r.value; });
    return {
        ...Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, String(v)])),
        ...settings
    };
}
