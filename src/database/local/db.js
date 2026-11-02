import Dexie from 'dexie';

export const db = new Dexie('BillMateLocalDB');

// Version 1 Schema
db.version(1).stores({
    // Products: indexed by uuid, name, category, barcode, is_active, sync_status
    products: 'uuid, id, user_id, name, category, barcode, is_active, sync_status, updated_at',

    // Categories: distinct list of categories per tenant
    categories: '++id, name, user_id, sync_status',

    // Customers: indexed by uuid, name, phone, sync_status
    customers: 'uuid, id, user_id, name, phone, sync_status, updated_at',

    // Suppliers: indexed by uuid, name, phone, sync_status
    suppliers: 'uuid, id, user_id, name, phone, sync_status, updated_at',

    // Sales: indexed by uuid, date, customer_uuid, payment_method, refunded, sync_status
    sales: 'uuid, id, user_id, date, customer_uuid, payment_method, refunded, sync_status, created_at',

    // Sale Items: indexed by uuid, sale_uuid, product_uuid
    sale_items: 'uuid, id, sale_uuid, product_uuid, user_id',

    // Purchases: indexed by uuid, date, supplier_uuid, sync_status
    purchases: 'uuid, id, user_id, date, supplier_uuid, sync_status, created_at',

    // Purchase Items: indexed by uuid, purchase_uuid, product_uuid
    purchase_items: 'uuid, id, purchase_uuid, product_uuid, user_id',

    // Expenses: indexed by uuid, date, type, sync_status
    expenses: 'uuid, id, user_id, date, type, sync_status, created_at',

    // Inventory Movements: append-only ledger for all stock deltas
    inventory_movements: 'uuid, product_uuid, movement_type, reference_uuid, sync_status, timestamp',

    // Sync Queue (Outbox): durable queue for outbound cloud sync
    sync_queue: 'uuid, entity, entity_uuid, action, status, attempts, created_at',

    // Sync Metadata: key-value store for sync watermarks and device ID
    sync_metadata: 'key',

    // Multi-user Offline PIN Auth store
    user_pin_auth: 'user_id, enrolled_at',

    // Settings store
    settings: 'key, user_id, value, sync_status'
});

export function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback compliant with UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

