import { supabase } from './supabase';

export async function getAllProducts() {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) throw error;
    return data || [];
}

export async function getProductById(id) {
    const { data } = await supabase.from('products').select('*').eq('id', id).single();
    return data;
}

export async function addProduct(product) {
    const { data, error } = await supabase.from('products').insert({
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
