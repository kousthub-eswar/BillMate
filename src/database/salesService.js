import { supabase } from './supabase';

export async function createSale(cart, paymentMethod, customerId = null, discount = null) {
    const { data, error } = await supabase.rpc('create_sale', {
        p_cart: cart.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            selling_price: item.selling_price,
            cost_price: item.cost_price || 0
        })),
        p_payment_method: paymentMethod,
        p_customer_id: customerId || null,
        p_discount_type: discount?.type || null,
        p_discount_value: discount?.value || 0
    });
    if (error) throw error;
    return { saleId: data.saleId, total: data.total, profit: data.profit };
}

export async function getSaleById(id) {
    const { data: sale } = await supabase.from('sales').select('*').eq('id', id).single();
    if (sale) {
        const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', id);
        sale.items = items || [];
    }
    return sale;
}

export async function getSales(filter = 'today') {
    let query = supabase.from('sales').select('*').neq('payment_method', 'Settle').order('date', { ascending: false });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    switch (filter) {
        case 'today':
            query = query.gte('date', startOfToday);
            break;
        case 'week': {
            const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
            query = query.gte('date', weekAgo);
            break;
        }
        case 'month': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            query = query.gte('date', monthStart);
            break;
        }
        case 'all':
            break;
        default:
            if (filter.startDate && filter.endDate) {
                query = query.gte('date', new Date(filter.startDate).toISOString());
                const end = new Date(filter.endDate);
                end.setHours(23, 59, 59, 999);
                query = query.lte('date', end.toISOString());
            }
    }

    const { data } = await query;
    return data || [];
}

export async function refundSale(saleId) {
    const { data, error } = await supabase.rpc('refund_sale', { p_sale_id: saleId });
    if (error) throw error;
    return data;
}

export async function undoLastSale() {
    const { data, error } = await supabase.rpc('undo_last_sale');
    if (error) throw error;
    return data || { success: false, message: 'Failed to undo' };
}

export async function getTodayStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const { data: todaySales } = await supabase.from('sales').select('total, profit')
        .gte('date', startOfToday).eq('refunded', false).neq('payment_method', 'Settle');

    const sales = todaySales || [];
    return {
        totalRevenue: sales.reduce((s, r) => s + Number(r.total), 0),
        totalProfit: sales.reduce((s, r) => s + Number(r.profit), 0),
        transactionCount: sales.length
    };
}

export async function getTopSellingProducts(limit = 5) {
    const { data: sales } = await supabase.from('sales').select('id').eq('refunded', false);
    if (!sales || sales.length === 0) return [];

    const saleIds = sales.map(s => s.id);
    const { data: items } = await supabase.from('sale_items').select('product_name, quantity').in('sale_id', saleIds);

    const productSales = {};
    (items || []).forEach(item => {
        productSales[item.product_name] = (productSales[item.product_name] || 0) + item.quantity;
    });

    return Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, quantity]) => ({ name, quantity }));
}
