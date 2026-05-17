import { supabase } from './supabase';

// Note: createPurchase, deletePurchase, quickRestock all use RPCs that stamp user_id server-side

export async function createPurchase(supplierId, items, notes = '') {
    const purchaseItems = items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: parseInt(item.quantity),
        purchase_price: parseFloat(item.purchase_price)
    }));

    const { data, error } = await supabase.rpc('create_purchase', {
        p_supplier_id: supplierId,
        p_items: purchaseItems,
        p_notes: notes
    });
    if (error) throw error;
    return { purchaseId: data.purchaseId, totalCost: data.totalCost };
}

export async function getPurchases(filter = 'all') {
    let query = supabase.from('purchases').select('*').order('date', { ascending: false });

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
        default:
            break;
    }

    const { data } = await query;
    return data || [];
}

export async function getPurchaseById(id) {
    const { data: purchase } = await supabase.from('purchases').select('*').eq('id', id).single();
    if (purchase) {
        const { data: items } = await supabase.from('purchase_items').select('*').eq('purchase_id', id);
        purchase.items = items || [];
    }
    return purchase;
}

export async function getPurchasesBySupplier(supplierId) {
    const { data } = await supabase.from('purchases').select('*').eq('supplier_id', supplierId).order('date', { ascending: false });
    return data || [];
}

export async function deletePurchase(purchaseId) {
    const { data, error } = await supabase.rpc('delete_purchase', { p_purchase_id: purchaseId });
    if (error) throw error;
    return data;
}

export async function quickRestock(productId, quantity, purchasePrice, supplierId = null) {
    const { data, error } = await supabase.rpc('quick_restock', {
        p_product_id: productId,
        p_quantity: parseInt(quantity),
        p_purchase_price: parseFloat(purchasePrice),
        p_supplier_id: supplierId
    });
    if (error) throw error;
    return { purchaseId: data.purchaseId, totalCost: data.totalCost };
}

export async function getPurchaseStats() {
    const { data: purchases } = await supabase.from('purchases').select('total_cost');
    const list = purchases || [];
    return {
        totalPurchases: list.length,
        totalSpend: list.reduce((sum, p) => sum + Number(p.total_cost || 0), 0)
    };
}
