import { db, generateUUID } from './db';
import { getActiveUserId } from './offlineAuth';

export async function getAllProducts(page = null, pageSize = 25, search = '', category = 'All') {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    let products = await db.products.where('user_id').equals(userId).toArray();
    // Filter active products
    products = products.filter(p => p.is_active !== false);

    if (search && search.trim()) {
        const lower = search.toLowerCase().trim();
        products = products.filter(p =>
            (p.name && p.name.toLowerCase().includes(lower)) ||
            (p.barcode && p.barcode.toLowerCase().includes(lower))
        );
    }

    if (category && category !== 'All') {
        products = products.filter(p => p.category === category);
    }

    // Sort by name
    products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const count = products.length;
    if (page !== null) {
        const from = (page - 1) * pageSize;
        const paged = products.slice(from, from + pageSize);
        return { data: paged, count };
    }
    return products;
}

export async function getProductById(idOrUuid) {
    if (!idOrUuid) return null;
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    let prod = await db.products.get(String(idOrUuid));
    if (!prod) {
        prod = await db.products.where('id').equals(Number(idOrUuid)).first();
    }
    if (prod && prod.user_id !== userId) return null;
    return prod || null;
}

export async function addProduct(product) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const uuid = product.uuid || generateUUID();
    const now = new Date().toISOString();

    const productRecord = {
        uuid,
        user_id: userId,
        name: (product.name || '').trim(),
        selling_price: parseFloat(product.selling_price) || 0,
        cost_price: parseFloat(product.cost_price) || 0,
        stock_quantity: parseInt(product.stock_quantity) || 0,
        category: product.category || 'General',
        frequently_used: product.frequently_used ? 1 : 0,
        barcode: product.barcode || '',
        is_active: true,
        sync_status: 'PENDING',
        created_at: now,
        updated_at: now
    };

    await db.transaction('rw', [db.products, db.sync_queue], async () => {
        await db.products.put(productRecord);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'products',
            action: 'CREATE',
            entity_uuid: uuid,
            payload: productRecord,
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });

    return uuid;
}

export async function updateProduct(idOrUuid, updates) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const prod = await getProductById(idOrUuid);
    if (!prod) throw new Error('Product not found in local database');

    const now = new Date().toISOString();
    const cleanUpdates = {
        ...updates,
        sync_status: 'PENDING',
        updated_at: now
    };
    if (cleanUpdates.selling_price !== undefined) cleanUpdates.selling_price = parseFloat(cleanUpdates.selling_price) || 0;
    if (cleanUpdates.cost_price !== undefined) cleanUpdates.cost_price = parseFloat(cleanUpdates.cost_price) || 0;
    if (cleanUpdates.stock_quantity !== undefined) cleanUpdates.stock_quantity = parseInt(cleanUpdates.stock_quantity) || 0;
    if (cleanUpdates.frequently_used !== undefined) cleanUpdates.frequently_used = cleanUpdates.frequently_used ? 1 : 0;
    delete cleanUpdates.user_id;

    await db.transaction('rw', [db.products, db.sync_queue], async () => {
        await db.products.update(prod.uuid, cleanUpdates);
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'products',
            action: 'UPDATE',
            entity_uuid: prod.uuid,
            payload: { ...prod, ...cleanUpdates, user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });
}

export async function deleteProduct(idOrUuid) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const prod = await getProductById(idOrUuid);
    if (!prod) return;

    const now = new Date().toISOString();
    await db.transaction('rw', [db.products, db.sync_queue], async () => {
        // Soft-delete locally
        await db.products.update(prod.uuid, { is_active: false, sync_status: 'PENDING', updated_at: now });
        await db.sync_queue.put({
            uuid: generateUUID(),
            entity: 'products',
            action: 'DELETE',
            entity_uuid: prod.uuid,
            payload: { uuid: prod.uuid, id: prod.id, user_id: userId },
            status: 'PENDING',
            attempts: 0,
            created_at: now
        });
    });
}

export async function searchProducts(query) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error('User not authenticated');

    const lower = (query || '').toLowerCase().trim();
    if (!lower) return [];
    const all = await getAllProducts();
    return all.filter(p =>
        (p.name && p.name.toLowerCase().includes(lower)) ||
        (p.barcode && p.barcode.toLowerCase().includes(lower)) ||
        (p.category && p.category.toLowerCase().includes(lower))
    );
}

export async function getFrequentProducts() {
    const all = await getAllProducts();
    return all.filter(p => p.frequently_used === 1);
}

export async function getLowStockProducts(threshold = 5) {
    const all = await getAllProducts();
    return all
        .filter(p => p.stock_quantity <= threshold)
        .sort((a, b) => a.stock_quantity - b.stock_quantity);
}

export async function adjustStock(idOrUuid, adjustment) {
    const prod = await getProductById(idOrUuid);
    if (!prod) throw new Error('Product not found');
    const newQty = Math.max(0, prod.stock_quantity + adjustment);
    await updateProduct(prod.uuid, { stock_quantity: newQty });
}

export async function getCategories() {
    const all = await getAllProducts();
    const set = new Set(all.map(p => p.category).filter(Boolean));
    return [...set];
}

export async function updateProductCategories(oldCategory, newCategory) {
    const all = await getAllProducts(null, null, '', oldCategory);
    for (const p of all) {
        await updateProduct(p.uuid, { category: newCategory });
    }
}
