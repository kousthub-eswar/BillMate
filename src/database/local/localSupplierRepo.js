import { db, generateUUID } from './db';
import { getActiveUserId } from './offlineAuth';

export async function addSupplier(supplier) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const uuid = supplier.uuid || generateUUID();
    const now = new Date().toISOString();

    const record = {
        uuid,
        user_id: userId,
        name: (supplier.name || '').trim(),
        phone: supplier.phone || '',
        address: supplier.address || '',
        notes: supplier.notes || '',
        sync_status: 'PENDING',
        created_at: now,
        updated_at: now
    };

    await db.transaction('rw', [db.suppliers, db.sync_queue], async () => {
        await db.suppliers.put(record);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'suppliers',
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

export async function getAllSuppliers() {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const list = await db.suppliers.where('user_id').equals(userId).toArray();
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getSupplierById(idOrUuid) {
    if (!idOrUuid) return null;
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    let supp = await db.suppliers.get(String(idOrUuid));
    if (!supp) {
        supp = await db.suppliers.where('id').equals(Number(idOrUuid)).first();
    }
    if (supp && supp.user_id !== userId) return null;
    return supp || null;
}

export async function updateSupplier(idOrUuid, updates) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const supp = await getSupplierById(idOrUuid);
    if (!supp) throw new Error('Supplier not found');

    const now = new Date().toISOString();
    const cleanUpdates = { ...updates, sync_status: 'PENDING', updated_at: now };
    delete cleanUpdates.user_id;

    await db.transaction('rw', [db.suppliers, db.sync_queue], async () => {
        await db.suppliers.update(supp.uuid, cleanUpdates);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'suppliers',
            action: 'UPDATE',
            entity_uuid: supp.uuid,
            payload: { ...supp, ...cleanUpdates, user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });
}

export async function deleteSupplier(idOrUuid) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const supp = await getSupplierById(idOrUuid);
    if (!supp) return;

    const now = new Date().toISOString();
    await db.transaction('rw', [db.suppliers, db.sync_queue], async () => {
        await db.suppliers.delete(supp.uuid);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'suppliers',
            action: 'DELETE',
            entity_uuid: supp.uuid,
            payload: { uuid: supp.uuid, id: supp.id, user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });
}

export async function searchSuppliers(query) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const lower = (query || '').toLowerCase().trim();
    if (!lower) return [];
    const all = await getAllSuppliers();
    return all.filter(s =>
        (s.name && s.name.toLowerCase().includes(lower)) ||
        (s.phone && s.phone.toLowerCase().includes(lower))
    );
}

export async function getSupplierStats(supplierIdOrUuid) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const supp = await getSupplierById(supplierIdOrUuid);
    const suppUuid = supp ? supp.uuid : String(supplierIdOrUuid);

    let purchases = await db.purchases.where('supplier_uuid').equals(suppUuid).and(p => p.user_id === userId).toArray();
    if (purchases.length === 0 && supp && supp.id) {
        purchases = await db.purchases.where('supplier_id').equals(supp.id).and(p => p.user_id === userId).toArray();
    }

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
