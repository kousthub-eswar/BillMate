import { supabase, getCurrentUserId } from './supabase';

export async function getAllProducts(page = null, pageSize = 25, search = '', category = 'All') {
    let query = supabase.from('products').select('*', { count: 'exact' }).order('name');

    if (search && search.trim()) {
        const lower = search.toLowerCase().trim();
        query = query.or(`name.ilike.%${lower}%,barcode.ilike.%${lower}%`);
    }

    if (category && category !== 'All') {
        query = query.eq('category', category);
    }

    if (page !== null) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    if (page !== null) {
        return { data: data || [], count: count || 0 };
    }
    return data || [];
}

export async function getProductById(id) {
    const { data } = await supabase.from('products').select('*').eq('id', id).single();
    return data;
}

export async function addProduct(product) {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('products').insert({
        user_id: userId,
        name: product.name.trim(),
        selling_price: parseFloat(product.selling_price) || 0,
        cost_price: parseFloat(product.cost_price) || 0,
        stock_quantity: parseInt(product.stock_quantity) || 0,
        category: product.category || 'General',
        frequently_used: product.frequently_used ? 1 : 0,
        barcode: product.barcode || ''
    }).select().single();
    if (error) throw error;
    return data.id;
}

export async function updateProduct(id, updates) {
    const clean = { ...updates, updated_at: new Date().toISOString() };
    if (clean.selling_price !== undefined) clean.selling_price = parseFloat(clean.selling_price) || 0;
    if (clean.cost_price !== undefined) clean.cost_price = parseFloat(clean.cost_price) || 0;
    if (clean.stock_quantity !== undefined) clean.stock_quantity = parseInt(clean.stock_quantity) || 0;
    if (clean.frequently_used !== undefined) clean.frequently_used = clean.frequently_used ? 1 : 0;
    // Don't send user_id in update payload
    delete clean.user_id;
    const { error } = await supabase.from('products').update(clean).eq('id', id);
    if (error) throw error;
}

export async function deleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
}

export async function searchProducts(query) {
    const lower = query.toLowerCase();
    const { data } = await supabase.from('products').select('*').or(`name.ilike.%${lower}%,barcode.ilike.%${lower}%,category.ilike.%${lower}%`);
    return data || [];
}

export async function getFrequentProducts() {
    const { data } = await supabase.from('products').select('*').eq('frequently_used', 1);
    return data || [];
}

export async function getLowStockProducts(threshold = 5) {
    const { data } = await supabase.from('products').select('*').lte('stock_quantity', threshold).order('stock_quantity');
    return data || [];
}

export async function adjustStock(id, adjustment) {
    const product = await getProductById(id);
    if (!product) throw new Error('Product not found');
    const newQty = Math.max(0, product.stock_quantity + adjustment);
    await supabase.from('products').update({ stock_quantity: newQty, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function getCategories() {
    const { data } = await supabase.from('products').select('category');
    const cats = new Set((data || []).map(p => p.category).filter(Boolean));
    return [...cats];
}

export async function updateProductCategories(oldCategory, newCategory) {
    const { error } = await supabase
        .from('products')
        .update({ category: newCategory, updated_at: new Date().toISOString() })
        .eq('category', oldCategory);
    if (error) throw error;
}
