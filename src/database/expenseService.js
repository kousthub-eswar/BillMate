import { db } from './db';

export async function addExpense(expense) {
    return await db.expenses.add({
        type: expense.type,
        amount: parseFloat(expense.amount),
        date: new Date().toISOString(),
        note: expense.note || ''
    });
}

export async function getTodayExpenses() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const all = await db.expenses.toArray();
    return all.filter(e => new Date(e.date) >= startOfToday);
}

export async function getExpensesByDate(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const all = await db.expenses.orderBy('date').reverse().toArray();
    return all.filter(e => {
        const d = new Date(e.date);
        return d >= start && d <= end;
    });
}

export async function deleteExpense(id) {
    return await db.expenses.delete(id);
}

export async function getTodayExpenseTotal() {
    const expenses = await getTodayExpenses();
    return expenses.reduce((sum, e) => sum + e.amount, 0);
}
