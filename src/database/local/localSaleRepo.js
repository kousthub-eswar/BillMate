import { db, generateUUID } from './db';
import { getActiveUserId } from './offlineAuth';
import { getProductById } from './localProductRepo';
import { getCustomerById } from './localCustomerRepo';

export async function createSale(cart, paymentMethod, customerId = null, discount = null) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const saleUuid = generateUUID();
    const now = new Date().toISOString();

    let subtotal = 0;
    let profit = 0;
    let itemCount = 0;
    const saleItems = [];
    const stockUpdates = [];
    const inventoryMovements = [];

    // 1. Process items and validate
    for (const item of cart) {
        const qty = parseInt(item.quantity) || 1;
        const sellingPrice = parseFloat(item.selling_price) || 0;
        const costPrice = parseFloat(item.cost_price) || 0;

        subtotal += sellingPrice * qty;
        profit += (sellingPrice - costPrice) * qty;
        itemCount += qty;

        const prod = await getProductById(item.id || item.uuid);
        const prodUuid = prod ? prod.uuid : String(item.id || item.uuid);
        const movementUuid = prod ? generateUUID() : null;

        saleItems.push({
            uuid: generateUUID(),
            sale_uuid: saleUuid,
            product_uuid: prodUuid,
            product_id: prod ? prod.id : null,
            product_name: item.name,
            quantity: qty,
            selling_price: sellingPrice,
            cost_price: costPrice,
            subtotal: sellingPrice * qty,
            user_id: userId,
            movement_uuid: movementUuid
        });

        if (prod) {
            // Oversell Policy: calculate new stock (can be negative if oversold offline)
            const newStock = prod.stock_quantity - qty;
            stockUpdates.push({
                uuid: prod.uuid,
                newStock
            });

            inventoryMovements.push({
                uuid: movementUuid,
                product_uuid: prod.uuid,
                user_id: userId,
                quantity_change: -qty, // Negative for sale
                movement_type: 'SALE',
                reference_uuid: saleUuid,
                timestamp: now,
                sync_status: 'PENDING'
            });
        }
    }

    // 2. Compute discounts
    let discountAmount = 0;
    const discountVal = discount ? parseFloat(discount.value) || 0 : 0;
    const discountType = discount ? discount.type : null;

    if (discountVal > 0) {
        if (discountType === 'percent') {
            discountAmount = (subtotal * discountVal) / 100;
        } else {
            discountAmount = Math.min(discountVal, subtotal);
        }
    }

    const total = Math.max(0, subtotal - discountAmount);
    profit -= discountAmount;

    // Customer resolution
    let customerUuid = null;
    let customerDbId = null;
    let cust = null;
    if (customerId) {
        cust = await getCustomerById(customerId);
        if (cust) {
            customerUuid = cust.uuid;
            customerDbId = cust.id || null;
        }
    }

    const saleRecord = {
        uuid: saleUuid,
        id: null, // Populated after cloud sync
        user_id: userId,
        date: now,
        total,
        subtotal,
        discount_amount: discountAmount,
        discount_type: discountType,
        discount_value: discountVal,
        profit,
        payment_method: paymentMethod || 'Cash',
        refunded: false,
        customer_uuid: customerUuid,
        customer_id: customerDbId,
        customer_name: cust ? cust.name : null,
        item_count: itemCount,
        sync_status: 'PENDING',
        created_at: now
    };

    // 3. Commit Atomic Dexie Transaction
    await db.transaction('rw', [db.sales, db.sale_items, db.products, db.customers, db.inventory_movements, db.sync_queue], async () => {
        // A. Insert sale record
        await db.sales.put(saleRecord);

        // B. Insert sale items
        for (const si of saleItems) {
            await db.sale_items.put(si);
        }

        // C. Update stock quantities locally
        for (const su of stockUpdates) {
            await db.products.update(su.uuid, { stock_quantity: su.newStock, updated_at: now });
        }

        // D. Record inventory ledger movements
        for (const im of inventoryMovements) {
            await db.inventory_movements.put(im);
        }

        // E. Update customer debt if Credit sale
        if (paymentMethod === 'Credit' && cust) {
            const newBal = (Number(cust.balance) || 0) + total;
            await db.customers.update(cust.uuid, { balance: newBal, updated_at: now });
        }

        // F. Enqueue durable outbound sync task with idempotency key
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'sales',
            action: 'CREATE',
            entity_uuid: saleUuid,
            idempotency_key: saleUuid,
            payload: {
                sale: saleRecord,
                items: saleItems,
                customer_uuid: customerUuid,
                user_id: userId
            },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });

    return { saleId: saleUuid, total, profit };
}

export async function getSaleById(idOrUuid) {
    if (!idOrUuid) return null;
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    let sale = await db.sales.get(String(idOrUuid));
    if (!sale) {
        sale = await db.sales.where('id').equals(Number(idOrUuid)).first();
    }
    if (sale && sale.user_id !== userId) return null;

    if (sale) {
        const items = await db.sale_items.where('sale_uuid').equals(sale.uuid).toArray();
        sale.items = items;
        if (!sale.customer_name && sale.customer_uuid) {
            const cust = await db.customers.get(sale.customer_uuid);
            if (cust) sale.customer_name = cust.name;
        }
    }
    return sale || null;
}

export async function getSales(filter = 'today', page = null, pageSize = 25, searchQuery = '', paymentMethod = 'All') {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const now = new Date();
    let sales = await db.sales.where('user_id').equals(userId).reverse().sortBy('date');

    // Filter out internal settle records
    sales = sales.filter(s => s.payment_method !== 'Settle');

    if (typeof filter === 'string') {
        if (filter === 'today') {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            sales = sales.filter(s => s.date >= startOfToday);
        } else if (filter === 'week') {
            const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
            sales = sales.filter(s => s.date >= weekAgo);
        } else if (filter === 'month') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            sales = sales.filter(s => s.date >= monthStart);
        }
    } else if (filter && filter.startDate && filter.endDate) {
        const start = new Date(filter.startDate).toISOString();
        const end = new Date(filter.endDate);
        end.setHours(23, 59, 59, 999);
        sales = sales.filter(s => s.date >= start && s.date <= end.toISOString());
    }

    if (paymentMethod && paymentMethod !== 'All') {
        sales = sales.filter(s => s.payment_method === paymentMethod);
    }

    if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        sales = sales.filter(s =>
            String(s.id || '').includes(q) ||
            String(s.uuid || '').includes(q) ||
            (s.customer_name && s.customer_name.toLowerCase().includes(q))
        );
    }

    // Populate customer names if missing
    for (const s of sales) {
        if (!s.customer_name && s.customer_uuid) {
            const cust = await db.customers.get(s.customer_uuid);
            if (cust) s.customer_name = cust.name;
        }
    }

    const count = sales.length;
    if (page !== null) {
        const from = (page - 1) * pageSize;
        return { data: sales.slice(from, from + pageSize), count };
    }
    return sales;
}

export async function refundSale(saleIdOrUuid) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const sale = await getSaleById(saleIdOrUuid);
    if (!sale) throw new Error('Sale not found');
    if (sale.refunded) throw new Error('Already refunded');

    const now = new Date().toISOString();
    const restockMovements = [];

    for (const item of (sale.items || [])) {
        if (item.product_uuid) {
            const prod = await getProductById(item.product_uuid);
            if (prod) {
                const restoredStock = prod.stock_quantity + item.quantity;
                await db.products.update(prod.uuid, { stock_quantity: restoredStock, updated_at: now });

                restockMovements.push({
                    uuid: generateUUID(),
                    product_uuid: prod.uuid,
                    user_id: sale.user_id,
                    quantity_change: item.quantity,
                    movement_type: 'RETURN',
                    reference_uuid: sale.uuid,
                    timestamp: now,
                    sync_status: 'PENDING'
                });
            }
        }
    }

    await db.transaction('rw', [db.sales, db.inventory_movements, db.sync_queue], async () => {
        await db.sales.update(sale.uuid, { refunded: true, sync_status: 'PENDING' });
        for (const rm of restockMovements) {
            await db.inventory_movements.put(rm);
        }
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'sales',
            action: 'REFUND',
            entity_uuid: sale.uuid,
            idempotency_key: generateUUID(),
            payload: { sale_uuid: sale.uuid, sale_id: sale.id, user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });

    return { success: true };
}

export async function undoLastSale() {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const sales = await db.sales
        .where('user_id')
        .equals(userId)
        .filter(s => !s.refunded)
        .reverse()
        .sortBy('date');

    if (sales.length === 0) return { success: false, message: 'No sales to undo' };
    const lastSale = sales[0];
    await refundSale(lastSale.uuid);
    return { success: true, saleId: lastSale.uuid };
}

export async function getTodayStats() {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const todaySales = await db.sales
        .where('date')
        .aboveOrEqual(startOfToday)
        .and(s => s.user_id === userId)
        .toArray();

    const validSales = todaySales.filter(s => !s.refunded && s.payment_method !== 'Settle');
    return {
        totalRevenue: validSales.reduce((sum, s) => sum + Number(s.total || 0), 0),
        totalProfit: validSales.reduce((sum, s) => sum + Number(s.profit || 0), 0),
        transactionCount: validSales.length
    };
}

export async function getDashboardStats(startDate, endDate) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const start = new Date(startDate).toISOString();
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const endIso = end.toISOString();

    const sales = await db.sales
        .where('date')
        .between(start, endIso, true, true)
        .and(s => s.user_id === userId)
        .toArray();

    const valid = sales.filter(s => !s.refunded && s.payment_method !== 'Settle');
    const totalRevenue = valid.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const totalProfit = valid.reduce((sum, s) => sum + Number(s.profit || 0), 0);
    const transactionCount = valid.length;

    // Top selling products
    const validUuids = new Set(valid.map(s => s.uuid));
    const allItems = await db.sale_items.where('user_id').equals(userId).toArray();
    const filteredItems = allItems.filter(i => validUuids.has(i.sale_uuid));

    const productSales = {};
    for (const item of filteredItems) {
        productSales[item.product_name] = (productSales[item.product_name] || 0) + item.quantity;
    }

    const topProducts = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, quantity]) => ({ name, quantity }));

    return {
        totalRevenue,
        totalProfit,
        transactionCount,
        topProducts
    };
}

export async function getTopSellingProducts(limit = 5) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const allItems = await db.sale_items.where('user_id').equals(userId).toArray();
    const salesMap = {};
    for (const item of allItems) {
        salesMap[item.product_name] = (salesMap[item.product_name] || 0) + item.quantity;
    }
    return Object.entries(salesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, quantity]) => ({ name, quantity }));
}
