import { db } from './db';

export async function createPurchase(supplierId, items, notes = '') {
    const purchaseItems = items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: parseInt(item.quantity),
        purchase_price: parseFloat(item.purchase_price)
    }));

    const totalCost = purchaseItems.reduce(
        (sum, item) => sum + (item.quantity * item.purchase_price), 0
    );

    const purchaseId = await db.transaction(
        'rw',
        db.purchases, db.purchaseItems, db.products,
        async () => {
            const id = await db.purchases.add({
                supplier_id: supplierId,
                date: new Date().toISOString(),
                total_cost: totalCost,
                notes: notes
            });

            const itemsWithPurchaseId = purchaseItems.map(item => ({
                ...item,
                purchase_id: id
            }));
            await db.purchaseItems.bulkAdd(itemsWithPurchaseId);

            // Update stock and cost prices atomically
            for (const item of purchaseItems) {
                const product = await db.products.get(item.product_id);
                if (product) {
                    const newStock = product.stock_quantity + item.quantity;
                    const updates = { stock_quantity: newStock };

                    // Update cost price to the latest purchase price
                    if (item.purchase_price > 0) {
                        updates.cost_price = item.purchase_price;
                    }

                    await db.products.update(item.product_id, updates);
                }
            }

            return id;
        }
    );

    return { purchaseId, totalCost };
}

export async function getPurchases(filter = 'all') {
    let purchases = await db.purchases.orderBy('date').reverse().toArray();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
        case 'today':
            purchases = purchases.filter(p => new Date(p.date) >= startOfToday);
            break;
        case 'week': {
            const weekAgo = new Date(startOfToday);
            weekAgo.setDate(weekAgo.getDate() - 7);
            purchases = purchases.filter(p => new Date(p.date) >= weekAgo);
            break;
        }
        case 'month': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            purchases = purchases.filter(p => new Date(p.date) >= monthStart);
            break;
        }
        case 'all':
        default:
            break;
    }

    return purchases;
}

export async function getPurchaseById(id) {
    const purchase = await db.purchases.get(id);
    if (purchase) {
        purchase.items = await db.purchaseItems
            .where('purchase_id')
            .equals(id)
            .toArray();
    }
    return purchase;
}

export async function getPurchasesBySupplier(supplierId) {
    return await db.purchases
        .where('supplier_id')
        .equals(supplierId)
        .reverse()
        .sortBy('date');
}

export async function deletePurchase(purchaseId) {
    return await db.transaction(
        'rw',
        db.purchases, db.purchaseItems, db.products,
        async () => {
            // Reverse stock changes
            const items = await db.purchaseItems
                .where('purchase_id')
                .equals(purchaseId)
                .toArray();

            for (const item of items) {
                const product = await db.products.get(item.product_id);
                if (product) {
                    await db.products.update(item.product_id, {
                        stock_quantity: Math.max(0, product.stock_quantity - item.quantity)
                    });
                }
            }

            // Delete items and purchase record
            await db.purchaseItems.where('purchase_id').equals(purchaseId).delete();
            await db.purchases.delete(purchaseId);

            return true;
        }
    );
}

export async function quickRestock(productId, quantity, purchasePrice, supplierId = null) {
    const product = await db.products.get(productId);
    if (!product) throw new Error('Product not found');

    return await db.transaction(
        'rw',
        db.purchases, db.purchaseItems, db.products,
        async () => {
            const totalCost = quantity * purchasePrice;

            const purchaseId = await db.purchases.add({
                supplier_id: supplierId,
                date: new Date().toISOString(),
                total_cost: totalCost,
                notes: `Quick restock: ${product.name}`
            });

            await db.purchaseItems.add({
                purchase_id: purchaseId,
                product_id: productId,
                product_name: product.name,
                quantity: parseInt(quantity),
                purchase_price: parseFloat(purchasePrice)
            });

            // Update stock and cost price
            const updates = {
                stock_quantity: product.stock_quantity + parseInt(quantity)
            };
            if (purchasePrice > 0) {
                updates.cost_price = parseFloat(purchasePrice);
            }
            await db.products.update(productId, updates);

            return { purchaseId, totalCost };
        }
    );
}

export async function getPurchaseStats() {
    const purchases = await db.purchases.toArray();
    const totalSpend = purchases.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    return {
        totalPurchases: purchases.length,
        totalSpend
    };
}
