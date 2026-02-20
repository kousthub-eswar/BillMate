import { db } from '../database';

export async function exportAllData() {
    const products = await db.products.toArray();
    const sales = await db.sales.toArray();
    const saleItems = await db.saleItems.toArray();
    const settings = await db.settings.toArray();
    const expenses = await db.expenses.toArray();

    const data = {
        version: 2,
        exportDate: new Date().toISOString(),
        products,
        sales,
        saleItems,
        settings,
        expenses
    };

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

        if (!data.version || !data.products) {
            throw new Error('Invalid backup file format');
        }

        await db.transaction('rw', db.products, db.sales, db.saleItems, db.settings, db.expenses, async () => {
            await db.products.clear();
            await db.sales.clear();
            await db.saleItems.clear();
            await db.settings.clear();
            await db.expenses.clear();

            if (data.products?.length) await db.products.bulkAdd(data.products);
            if (data.sales?.length) await db.sales.bulkAdd(data.sales);
            if (data.saleItems?.length) await db.saleItems.bulkAdd(data.saleItems);
            if (data.settings?.length) await db.settings.bulkAdd(data.settings);
            if (data.expenses?.length) await db.expenses.bulkAdd(data.expenses);
        });

        return { success: true, message: 'Data imported successfully' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
