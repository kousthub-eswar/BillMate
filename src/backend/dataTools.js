import { supabase, getCurrentUserId } from '../database/supabase';

export async function exportAllData() {
    const tables = ['products', 'sales', 'sale_items', 'customers', 'suppliers', 'purchases', 'purchase_items', 'expenses', 'settings'];
    const data = { version: 4, exportDate: new Date().toISOString() };
    const userId = await getCurrentUserId();

    if (!userId) {
        throw new Error('User not authenticated');
    }

    for (const table of tables) {
        const { data: rows } = await supabase.from(table).select('*').eq('user_id', userId);
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
            if (table === 'settings') {
                await supabase.from(table).delete().neq('key', '');
            } else {
                const { error } = await supabase.from(table).delete().neq('id', -1);
                if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
            }
        }

        // Helper: insert rows, build old-ID → new-ID map
        const idMap = {};
        async function insertWithMap(table, rows) {
            if (!rows?.length) return;
            idMap[table] = {};

            for (const row of rows) {
                const oldId = row.id;
                const { id: _id, ...rest } = row;
                const stamped = { ...rest, user_id: userId };
                const { data: inserted, error } = await supabase.from(table).insert(stamped).select('id').single();
                if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`);
                if (oldId != null && inserted) {
                    idMap[table][oldId] = inserted.id;
                }
            }
        }

        // 1. Insert parent tables first (products, customers, suppliers)
        await insertWithMap('products', data.products);
        await insertWithMap('customers', data.customers);
        await insertWithMap('suppliers', data.suppliers);

        // 2. Insert sales — remap customer_id FK
        const remappedSales = (data.sales || []).map(row => ({
            ...row,
            customer_id: row.customer_id ? (idMap.customers?.[row.customer_id] ?? null) : null
        }));
        await insertWithMap('sales', remappedSales);

        // 3. Insert sale_items — remap sale_id and product_id FKs
        const saleItems = data.sale_items || data.saleItems || [];
        const remappedSaleItems = saleItems.map(row => ({
            ...row,
            sale_id: idMap.sales?.[row.sale_id] ?? row.sale_id,
            product_id: row.product_id ? (idMap.products?.[row.product_id] ?? null) : null
        }));
        await insertWithMap('sale_items', remappedSaleItems);

        // 4. Insert purchases — remap supplier_id FK
        const remappedPurchases = (data.purchases || []).map(row => ({
            ...row,
            supplier_id: row.supplier_id ? (idMap.suppliers?.[row.supplier_id] ?? null) : null
        }));
        await insertWithMap('purchases', remappedPurchases);

        // 5. Insert purchase_items — remap purchase_id and product_id FKs
        const purchaseItems = data.purchase_items || data.purchaseItems || [];
        const remappedPurchaseItems = purchaseItems.map(row => ({
            ...row,
            purchase_id: idMap.purchases?.[row.purchase_id] ?? row.purchase_id,
            product_id: row.product_id ? (idMap.products?.[row.product_id] ?? null) : null
        }));
        await insertWithMap('purchase_items', remappedPurchaseItems);

        // 6. Insert expenses (no FK remapping needed)
        await insertWithMap('expenses', data.expenses);

        // 7. Insert settings (keep composite key, no id column)
        if (data.settings?.length) {
            const settingsRows = data.settings.map(row => ({ ...row, user_id: userId }));
            const { error } = await supabase.from('settings').insert(settingsRows);
            if (error) throw new Error(`Failed to insert settings: ${error.message}`);
        }

        return { success: true, message: 'Data imported successfully' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
