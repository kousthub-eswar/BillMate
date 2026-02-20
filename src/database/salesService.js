import { db } from './db';

export async function createSale(cart, paymentMethod, customerId = null) {
    const saleItems = cart.map(item => ({
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        selling_price: item.selling_price,
        cost_price: item.cost_price,
        subtotal: item.selling_price * item.quantity
    }));

    const total = saleItems.reduce((sum, item) => sum + item.subtotal, 0);
    const profit = saleItems.reduce(
        (sum, item) => sum + (item.selling_price - item.cost_price) * item.quantity,
        0
    );

    const saleId = await db.transaction('rw', db.sales, db.saleItems, db.products, db.customers, async () => {
        const id = await db.sales.add({
            date: new Date().toISOString(),
            total,
            profit,
            payment_method: paymentMethod,
            refunded: false,
            customer_id: customerId,
            item_count: saleItems.reduce((sum, item) => sum + item.quantity, 0)
        });

        const itemsWithSaleId = saleItems.map(item => ({
            ...item,
            sale_id: id
        }));
        await db.saleItems.bulkAdd(itemsWithSaleId);

        // Reduce stock
        for (const item of cart) {
            const product = await db.products.get(item.id);
            if (product) {
                await db.products.update(item.id, {
                    stock_quantity: Math.max(0, product.stock_quantity - item.quantity)
                });
            }
        }

        // If Credit sale, update customer balance
        if (paymentMethod === 'Credit' && customerId) {
            const customer = await db.customers.get(customerId);
            if (customer) {
                await db.customers.update(customerId, {
                    balance: (customer.balance || 0) + total
                });
            }
        }

        return id;
    });

    return { saleId, total, profit };
}

export async function getSaleById(id) {
    const sale = await db.sales.get(id);
    if (sale) {
        sale.items = await db.saleItems.where('sale_id').equals(id).toArray();
    }
    return sale;
}

export async function getSales(filter = 'today') {
    let sales = await db.sales.orderBy('date').reverse().toArray();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (filter) {
        case 'today':
            sales = sales.filter(s => new Date(s.date) >= startOfToday);
            break;
        case 'week': {
            const weekAgo = new Date(startOfToday);
            weekAgo.setDate(weekAgo.getDate() - 7);
            sales = sales.filter(s => new Date(s.date) >= weekAgo);
            break;
        }
        case 'month': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            sales = sales.filter(s => new Date(s.date) >= monthStart);
            break;
        }
        case 'all':
            break;
        default:
            if (filter.startDate && filter.endDate) {
                const start = new Date(filter.startDate);
                const end = new Date(filter.endDate);
                end.setHours(23, 59, 59, 999);
                sales = sales.filter(s => {
                    const d = new Date(s.date);
                    return d >= start && d <= end;
                });
            }
    }

    return sales;
}

export async function refundSale(saleId) {
    return await db.transaction('rw', db.sales, db.saleItems, db.products, async () => {
        const sale = await db.sales.get(saleId);
        if (!sale || sale.refunded) return false;

        await db.sales.update(saleId, { refunded: true });

        const items = await db.saleItems.where('sale_id').equals(saleId).toArray();
        for (const item of items) {
            const product = await db.products.get(item.product_id);
            if (product) {
                await db.products.update(item.product_id, {
                    stock_quantity: product.stock_quantity + item.quantity
                });
            }
        }

        return true;
    });
}

export async function getTodayStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allSales = await db.sales.toArray();
    const todaySales = allSales.filter(
        s => new Date(s.date) >= startOfToday && !s.refunded
    );

    const totalRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    const totalProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
    const transactionCount = todaySales.length;

    return {
        totalRevenue,
        totalProfit,
        transactionCount
    };
}

export async function getTopSellingProducts(limit = 5) {
    const items = await db.saleItems.toArray();
    const sales = await db.sales.toArray();
    const nonRefundedIds = new Set(sales.filter(s => !s.refunded).map(s => s.id));

    const productSales = {};
    items
        .filter(item => nonRefundedIds.has(item.sale_id))
        .forEach(item => {
            if (!productSales[item.product_name]) {
                productSales[item.product_name] = 0;
            }
            productSales[item.product_name] += item.quantity;
        });

    return Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, quantity]) => ({ name, quantity }));
}
