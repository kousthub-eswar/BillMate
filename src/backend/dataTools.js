import { supabase, getCurrentUserId } from '../database/supabase';

export async function exportAllData() {
    const tables = ['products', 'sales', 'sale_items', 'customers', 'suppliers', 'purchases', 'purchase_items', 'expenses', 'settings'];
    const data = { version: 4, exportDate: new Date().toISOString() };

    for (const table of tables) {
        const { data: rows } = await supabase.from(table).select('*');
        data[table] = rows || [];
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billmate_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export async function importAllData(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        const userId = await getCurrentUserId();

        if (!data.version || !data.products) {
            throw new Error('Invalid backup file format');
        }

        // Clear existing data in order (children first, then parents)
        const clearOrder = ['sale_items', 'purchase_items', 'sales', 'purchases', 'expenses', 'products', 'customers', 'suppliers', 'settings'];
        for (const table of clearOrder) {
            await supabase.from(table).delete().neq('id', -1).catch(() => {
                // settings table uses composite key
                return supabase.from(table).delete().neq('key', '');
            });
        }

        // Insert data - stamp user_id on every row
        const insertMap = {
            products: data.products,
            customers: data.customers,
            suppliers: data.suppliers,
            sales: data.sales,
            sale_items: data.sale_items || data.saleItems,
            purchases: data.purchases,
            purchase_items: data.purchase_items || data.purchaseItems,
            expenses: data.expenses,
            settings: data.settings
        };

        for (const [table, rows] of Object.entries(insertMap)) {
            if (rows?.length) {
                const cleaned = rows.map(row => {
                    const { id, ...rest } = row;
                    const stamped = table === 'settings' ? { ...row, user_id: userId } : { ...rest, user_id: userId };
                    return stamped;
                });
                await supabase.from(table).insert(cleaned);
            }
        }

        return { success: true, message: 'Data imported successfully' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
