import Dexie from 'dexie';

const db = new Dexie('BillMateDB');

db.version(1).stores({
    products: '++id, name, category, frequently_used',
    sales: '++id, date, payment_method, refunded',
    saleItems: '++id, sale_id, product_id',
    settings: 'key'
});

db.version(2).stores({
    products: '++id, name, category, frequently_used',
    sales: '++id, date, payment_method, refunded',
    saleItems: '++id, sale_id, product_id',
    settings: 'key',
    expenses: '++id, type, date'
});

db.version(3).stores({
    products: '++id, name, category, frequently_used, barcode',
    sales: '++id, date, payment_method, refunded, customer_id',
    saleItems: '++id, sale_id, product_id',
    settings: 'key',
    expenses: '++id, type, date',
    customers: '++id, name, phone'
});

db.version(4).stores({
    products: '++id, name, category, frequently_used, barcode',
    sales: '++id, date, payment_method, refunded, customer_id',
    saleItems: '++id, sale_id, product_id',
    settings: 'key',
    expenses: '++id, type, date',
    customers: '++id, name, phone',
    suppliers: '++id, name, phone',
    purchases: '++id, supplier_id, date',
    purchaseItems: '++id, purchase_id, product_id'
});

// Default settings
const DEFAULT_SETTINGS = {
    shop_name: 'My Shop',
    currency: '₹',
    low_stock_threshold: 5,
    receipt_template: `🧾 *{shop_name}*\n──────────────\n{items}\n──────────────\n*Total: {currency}{total}*\nPayment: {payment_method}\nDate: {date}\n\nThank you for shopping with us! 🙏`
};

export async function initializeSettings() {
    const existing = await db.settings.get('shop_name');
    if (!existing) {
        const entries = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
            key,
            value
        }));
        await db.settings.bulkPut(entries);
    }
}

export async function getSetting(key) {
    const record = await db.settings.get(key);
    return record ? record.value : DEFAULT_SETTINGS[key];
}

export async function setSetting(key, value) {
    await db.settings.put({ key, value });
}

export async function getAllSettings() {
    const records = await db.settings.toArray();
    const settings = {};
    records.forEach(r => {
        settings[r.key] = r.value;
    });
    return { ...DEFAULT_SETTINGS, ...settings };
}

export { db, DEFAULT_SETTINGS };
