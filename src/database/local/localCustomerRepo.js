import { db, generateUUID } from './db';
import { getActiveUserId } from './offlineAuth';

export async function addCustomer(customer) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const uuid = customer.uuid || generateUUID();
    const now = new Date().toISOString();

    const record = {
        uuid,
        user_id: userId,
        name: (customer.name || '').trim(),
        phone: customer.phone || '',
        balance: Number(customer.balance) || 0,
        sync_status: 'PENDING',
        created_at: now,
        updated_at: now
    };

    await db.transaction('rw', [db.customers, db.sync_queue], async () => {
        await db.customers.put(record);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'customers',
            action: 'CREATE',
            entity_uuid: uuid,
            payload: record,
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });

    return uuid;
}

export async function getAllCustomers() {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const list = await db.customers.where('user_id').equals(userId).toArray();
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getCustomerById(idOrUuid) {
    if (!idOrUuid) return null;
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    let cust = await db.customers.get(String(idOrUuid));
    if (!cust) {
        cust = await db.customers.where('id').equals(Number(idOrUuid)).first();
    }
    if (cust && cust.user_id !== userId) return null;
    return cust || null;
}

export async function updateCustomerBalance(idOrUuid, amount) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const customer = await getCustomerById(idOrUuid);
    if (!customer) throw new Error('Customer not found');

    const newBalance = Math.max(0, (Number(customer.balance) || 0) - Number(amount));
    const now = new Date().toISOString();
    const saleUuid = generateUUID();

    // Settle sale record
    const settleSale = {
        uuid: saleUuid,
        user_id: userId,
        date: now,
        total: 0,
        subtotal: 0,
        discount_amount: 0,
        discount_value: 0,
        profit: 0,
        payment_method: 'Settle',
        refunded: false,
        customer_uuid: customer.uuid,
        customer_id: customer.id || null,
        item_count: 0,
        settle_amount: Number(amount),
        sync_status: 'PENDING',
        created_at: now
    };

    await db.transaction('rw', [db.customers, db.sales, db.sync_queue], async () => {
        await db.customers.update(customer.uuid, { balance: newBalance, updated_at: now, sync_status: 'PENDING' });
        await db.sales.put(settleSale);

        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'customers',
            action: 'UPDATE_BALANCE',
            entity_uuid: customer.uuid,
            idempotency_key: `settle_${saleUuid}`,
            payload: { customer_uuid: customer.uuid, customer_id: customer.id, settle_amount: Number(amount), new_balance: newBalance, user_id: userId, sale_uuid: saleUuid, date: now },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });
}

export async function getCustomerHistory(customerIdOrUuid, page = null, pageSize = 25) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const cust = await getCustomerById(customerIdOrUuid);
    const custUuid = cust ? cust.uuid : String(customerIdOrUuid);

    let sales = await db.sales.where('customer_uuid').equals(custUuid).and(s => s.user_id === userId).reverse().sortBy('date');
    if (sales.length === 0 && cust && cust.id) {
        sales = await db.sales.where('customer_id').equals(cust.id).and(s => s.user_id === userId).reverse().sortBy('date');
    }

    const count = sales.length;
    if (page !== null) {
        const from = (page - 1) * pageSize;
        return { data: sales.slice(from, from + pageSize), count };
    }
    return sales;
}

export async function searchCustomers(query) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const lower = (query || '').toLowerCase().trim();
    if (!lower) return [];
    const all = await getAllCustomers();
    return all.filter(c =>
        (c.name && c.name.toLowerCase().includes(lower)) ||
        (c.phone && c.phone.toLowerCase().includes(lower))
    );
}
