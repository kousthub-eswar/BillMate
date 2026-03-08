import { supabase } from './supabase';

export async function addSupplier(supplier) {
    const { data, error } = await supabase.from('suppliers').insert({
        name: supplier.name.trim(),
        phone: supplier.phone || '',
        address: supplier.address || '',
        notes: supplier.notes || ''
    }).select().single();
    if (error) throw error;
    return data.id;
}

export async function getAllSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name');
    return data || [];
}

export async function getSupplierById(id) {
    const { data } = await supabase.from('suppliers').select('*').eq('id', id).single();
    return data;
}

export async function updateSupplier(id, updates) {
    const { error } = await supabase.from('suppliers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
}

export async function deleteSupplier(id) {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
}

export async function searchSuppliers(query) {
    const lower = query.toLowerCase();
    const { data } = await supabase.from('suppliers').select('*').or(`name.ilike.%${lower}%,phone.ilike.%${lower}%`);
    return data || [];
}

export async function getSupplierStats(supplierId) {
    const { data: purchases } = await supabase.from('purchases').select('*').eq('supplier_id', supplierId);
    const list = purchases || [];
    const totalPurchases = list.length;
    const totalSpend = list.reduce((sum, p) => sum + Number(p.total_cost || 0), 0);
    const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
    return {
        totalPurchases,
        totalSpend,
        lastPurchaseDate: sorted.length > 0 ? sorted[0].date : null
    };
}
