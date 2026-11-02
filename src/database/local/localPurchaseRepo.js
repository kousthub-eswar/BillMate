import { db, generateUUID } from './db';
import { getActiveUserId } from './offlineAuth';
import { getProductById } from './localProductRepo';

export async function createPurchase(supplierIdOrUuid, items, notes = '') {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const purchaseUuid = generateUUID();
    const now = new Date().toISOString();

    let totalCost = 0;
    const purchaseItems = [];
    const stockUpdates = [];
    const inventoryMovements = [];

    for (const item of items) {
        const itemQty = parseInt(item.quantity) || 0;
        const itemPrice = parseFloat(item.purchase_price) || 0;
        totalCost += itemQty * itemPrice;

        const itemUuid = generateUUID();
        const prod = await getProductById(item.product_id);
        const movementUuid = prod ? generateUUID() : null;

        purchaseItems.push({
            uuid: itemUuid,
            purchase_uuid: purchaseUuid,
            product_uuid: prod ? prod.uuid : String(item.product_id),
            product_id: prod ? prod.id : null,
            product_name: item.product_name,
            quantity: itemQty,
            purchase_price: itemPrice,
            user_id: userId,
            movement_uuid: movementUuid
        });

        if (prod) {
            stockUpdates.push({
                uuid: prod.uuid,
                newStock: prod.stock_quantity + itemQty
            });

            inventoryMovements.push({
                uuid: movementUuid,
                product_uuid: prod.uuid,
                user_id: userId,
                quantity_change: itemQty, // Positive for restock
                movement_type: 'PURCHASE',
                reference_uuid: purchaseUuid,
                timestamp: now,
                sync_status: 'PENDING'
            });
        }
    }

    const purchaseRecord = {
        uuid: purchaseUuid,
        id: null,
        user_id: userId,
        supplier_uuid: String(supplierIdOrUuid),
        supplier_id: null,
        date: now,
        total_cost: totalCost,
        notes: notes || '',
        sync_status: 'PENDING',
        created_at: now
    };

    await db.transaction('rw', [db.purchases, db.purchase_items, db.products, db.inventory_movements, db.sync_queue], async () => {
        await db.purchases.put(purchaseRecord);
        for (const pi of purchaseItems) {
            await db.purchase_items.put(pi);
        }
        for (const su of stockUpdates) {
            // Also mark product updated_at so movements are acknowledged
            await db.products.update(su.uuid, { stock_quantity: su.newStock, updated_at: now });
        }
        for (const im of inventoryMovements) {
            await db.inventory_movements.put(im);
        }

        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'purchases',
            action: 'CREATE',
            entity_uuid: purchaseUuid,
            idempotency_key: purchaseUuid,
            payload: {
                purchase: purchaseRecord,
                items: purchaseItems,
                user_id: userId
            },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });

    return { purchaseId: purchaseUuid, totalCost };
}

export async function getPurchases(filter = 'all', page = null, pageSize = 25) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const now = new Date();
    let purchases = await db.purchases.where('user_id').equals(userId).reverse().sortBy('date');

    if (filter === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        purchases = purchases.filter(p => p.date >= startOfToday);
    } else if (filter === 'week') {
        const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
        purchases = purchases.filter(p => p.date >= weekAgo);
    } else if (filter === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        purchases = purchases.filter(p => p.date >= monthStart);
    }

    const count = purchases.length;
    if (page !== null) {
        const from = (page - 1) * pageSize;
        return { data: purchases.slice(from, from + pageSize), count };
    }
    return purchases;
}

export async function getPurchaseById(idOrUuid) {
    if (!idOrUuid) return null;
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    let p = await db.purchases.get(String(idOrUuid));
    if (!p) {
        p = await db.purchases.where('id').equals(Number(idOrUuid)).first();
    }
    if (p && p.user_id !== userId) return null;

    if (p) {
        const items = await db.purchase_items.where('purchase_uuid').equals(p.uuid).toArray();
        p.items = items;
    }
    return p || null;
}

export async function getPurchasesBySupplier(supplierIdOrUuid) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const list = await db.purchases
        .where('supplier_uuid')
        .equals(String(supplierIdOrUuid))
        .and(p => p.user_id === userId)
        .reverse()
        .sortBy('date');
    return list;
}

export async function deletePurchase(purchaseIdOrUuid) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const p = await getPurchaseById(purchaseIdOrUuid);
    if (!p) return { success: false };

    const now = new Date().toISOString();
    await db.transaction('rw', [db.purchases, db.purchase_items, db.sync_queue], async () => {
        await db.purchases.delete(p.uuid);
        await db.purchase_items.where('purchase_uuid').equals(p.uuid).delete();
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'purchases',
            action: 'DELETE',
            entity_uuid: p.uuid,
            idempotency_key: generateUUID(),
            payload: { uuid: p.uuid, id: p.id, user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });

    return { success: true };
}

export async function quickRestock(productId, quantity, purchasePrice, supplierId = null) {
    const prod = await getProductById(productId);
    if (!prod) throw new Error('Product not found');
    return createPurchase(supplierId || 'direct', [{
        product_id: prod.uuid,
        product_name: prod.name,
        quantity,
        purchase_price: purchasePrice
    }], 'Quick restock');
}

export async function getPurchaseStats() {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const list = await db.purchases.where('user_id').equals(userId).toArray();
    return {
        totalPurchases: list.length,
        totalSpend: list.reduce((sum, p) => sum + Number(p.total_cost || 0), 0)
    };
}
