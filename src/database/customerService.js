import { supabase, getCurrentUserId } from './supabase';

export async function addCustomer(customer) {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.from('customers').insert({
        user_id: userId,
        name: customer.name.trim(),
        phone: customer.phone || '',
        balance: 0
    }).select().single();
    if (error) throw error;
    return data.id;
}

export async function getAllCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name');
    return data || [];
}

export async function getCustomerById(id) {
    const { data } = await supabase.from('customers').select('*').eq('id', id).single();
    return data;
}

export async function updateCustomerBalance(id, amount) {
    const userId = await getCurrentUserId();
    const customer = await getCustomerById(id);
    if (!customer) throw new Error('Customer not found');
    const newBalance = Math.max(0, (Number(customer.balance) || 0) - amount);
    await supabase.from('customers').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', id);

    // Also record a settlement in sales for history
    await supabase.from('sales').insert({
        user_id: userId,
        date: new Date().toISOString(),
        total: 0,
        subtotal: 0,
        discount_amount: 0,
        discount_value: 0,
        profit: 0,
        payment_method: 'Settle',
        refunded: false,
        customer_id: id,
        item_count: 0,
        settle_amount: amount
    });
}

export async function getCustomerHistory(customerId, page = null, pageSize = 25) {
    let query = supabase.from('sales').select('*', { count: 'exact' }).eq('customer_id', customerId).order('date', { ascending: false });

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

export async function searchCustomers(query) {
    const lower = query.toLowerCase();
    const { data } = await supabase.from('customers').select('*').or(`name.ilike.%${lower}%,phone.ilike.%${lower}%`);
    return data || [];
}
