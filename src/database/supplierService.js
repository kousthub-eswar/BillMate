import { db } from './db';

export async function addSupplier(supplier) {
    return await db.suppliers.add({
        name: supplier.name.trim(),
        phone: supplier.phone || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
        created_at: new Date().toISOString()
    });
}

export async function getAllSuppliers() {
    return await db.suppliers.toArray();
}

export async function getSupplierById(id) {
    return await db.suppliers.get(id);
}

export async function updateSupplier(id, updates) {
    return await db.suppliers.update(id, updates);
}

export async function deleteSupplier(id) {
    return await db.suppliers.delete(id);
}

export async function searchSuppliers(query) {
    const lower = query.toLowerCase();
    return await db.suppliers
        .filter(s =>
            s.name.toLowerCase().includes(lower) ||
            (s.phone && s.phone.includes(query))
        )
        .toArray();
}

export async function getSupplierStats(supplierId) {
    const purchases = await db.purchases
        .where('supplier_id')
        .equals(supplierId)
        .toArray();

    const totalPurchases = purchases.length;
    const totalSpend = purchases.reduce((sum, p) => sum + (p.total_cost || 0), 0);
    const lastPurchase = purchases.length > 0
        ? purchases.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
        : null;

    return {
        totalPurchases,
        totalSpend,
        lastPurchaseDate: lastPurchase ? lastPurchase.date : null
    };
}
