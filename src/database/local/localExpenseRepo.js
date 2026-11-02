import { db, generateUUID } from './db';
import { getActiveUserId } from './offlineAuth';

export async function addExpense(expense) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const uuid = expense.uuid || generateUUID();
    const now = new Date().toISOString();

    const record = {
        uuid,
        user_id: userId,
        type: expense.type,
        amount: parseFloat(expense.amount) || 0,
        date: expense.date || now,
        note: expense.note || '',
        sync_status: 'PENDING',
        created_at: now
    };

    await db.transaction('rw', [db.expenses, db.sync_queue], async () => {
        await db.expenses.put(record);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'expenses',
            action: 'CREATE',
            entity_uuid: uuid,
            payload: record,
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });

    return uuid;
}

export async function getTodayExpenses(page = null, pageSize = 25) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const expenses = await db.expenses
        .where('date')
        .aboveOrEqual(startOfToday)
        .and(e => e.user_id === userId)
        .reverse()
        .sortBy('date');

    const count = expenses.length;
    if (page !== null) {
        const from = (page - 1) * pageSize;
        return { data: expenses.slice(from, from + pageSize), count };
    }
    return expenses;
}

export async function getExpensesByDate(startDate, endDate) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const start = new Date(startDate).toISOString();
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const endIso = end.toISOString();

    const list = await db.expenses
        .where('date')
        .between(start, endIso, true, true)
        .and(e => e.user_id === userId)
        .reverse()
        .sortBy('date');

    return list;
}

export async function deleteExpense(idOrUuid) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    let exp = await db.expenses.get(String(idOrUuid));
    if (!exp) {
        exp = await db.expenses.where('id').equals(Number(idOrUuid)).first();
    }
    if (!exp || exp.user_id !== userId) return;

    const now = new Date().toISOString();
    await db.transaction('rw', [db.expenses, db.sync_queue], async () => {
        await db.expenses.delete(exp.uuid);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'expenses',
            action: 'DELETE',
            entity_uuid: exp.uuid,
            payload: { uuid: exp.uuid, id: exp.id, user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });
}

export async function getTodayExpenseTotal() {
    const expenses = await getTodayExpenses();
    const list = Array.isArray(expenses) ? expenses : (expenses.data || []);
    return list.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

export async function getExpenseTotal(startDate, endDate) {
    const expenses = await getExpensesByDate(startDate, endDate);
    return expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}
