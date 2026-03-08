import { supabase } from './supabase';

export async function addExpense(expense) {
    const { data, error } = await supabase.from('expenses').insert({
        type: expense.type,
        amount: parseFloat(expense.amount),
        date: new Date().toISOString(),
        note: expense.note || ''
    }).select().single();
    if (error) throw error;
    return data.id;
}

export async function getTodayExpenses() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const { data } = await supabase.from('expenses').select('*').gte('date', startOfToday).order('date', { ascending: false });
    return data || [];
}

export async function getExpensesByDate(startDate, endDate) {
    const start = new Date(startDate).toISOString();
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const { data } = await supabase.from('expenses').select('*').gte('date', start).lte('date', end.toISOString()).order('date', { ascending: false });
    return data || [];
}

export async function deleteExpense(id) {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
}

export async function getTodayExpenseTotal() {
    const expenses = await getTodayExpenses();
    return expenses.reduce((sum, e) => sum + Number(e.amount), 0);
}
