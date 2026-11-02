import { db } from '../database/local/db';
import { supabase } from '../database/supabase';
import { getActiveUserId, isWorkspaceUnlockedOffline } from '../database/local/offlineAuth';

let isSyncing = false;
let isControlledSyncing = false;
let syncTimer = null;

// Event broadcaster for UI status pills
export function broadcastSyncStatus(detail) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('billmate-sync-status', { detail }));
    }
}

export function isNetworkAvailable() {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        return navigator.onLine;
    }
    return true;
}

export async function getPendingCount() {
    return await db.sync_queue.where('status').equals('PENDING').count();
}

/**
 * Controlled synchronization coordinator:
 * Sequences outbound queue draining before inbound snapshot hydration,
 * with workspace-level mutex locking.
 */
export async function runControlledSync() {
    if (isControlledSyncing || !isNetworkAvailable()) return;
        const userId = await getActiveUserId();
    if (!userId) return;

    // Offline PIN security guard: if user unlocked workspace using offline PIN only,
    // wait until a valid Supabase cloud session is authenticated before pushing outbox.
    if (isWorkspaceUnlockedOffline()) {
        try {
            const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
            if (sessionErr || !sessionData?.session?.user) {
                // Offline-only PIN unlock without cloud session. Preserve pending queue.
                return;
            }
        } catch {
            return;
        }
    }

    isControlledSyncing = true;
    try {
        // Step 1: Fully drain outbox transactions first
        await drainSyncQueue();

        // Step 2: Hydrate inbound cloud snapshot
        await syncInbound();
    } catch (err) {
        console.error('Controlled sync cycle error:', err);
    } finally {
        isControlledSyncing = false;
    }
}

/**
 * Main trigger for draining the outbox queue
 */
export async function drainSyncQueue() {
    if (isSyncing || !isNetworkAvailable()) return;
    const userId = await getActiveUserId();
    if (!userId) return;

    const pendingCount = await getPendingCount();
    if (pendingCount === 0) {
        broadcastSyncStatus({
            status: 'ONLINE',
            pendingCount: 0,
            lastSyncTime: new Date().toISOString()
        });
        return;
    }

    isSyncing = true;
    broadcastSyncStatus({
        status: 'SYNCING',
        pendingCount,
        message: `Syncing ${pendingCount} offline transaction(s)...`
    });

    try {
        const queueItems = await db.sync_queue
            .where('status')
            .equals('PENDING')
            .sortBy('created_at');

        for (const item of queueItems) {
            if (!isNetworkAvailable()) break;

            await db.sync_queue.update(item.uuid, { status: 'SYNCING' });
            try {
                await processQueueItem(item, userId);
                // Mark success
                await db.sync_queue.update(item.uuid, {
                    status: 'SYNCED',
                    synced_at: new Date().toISOString()
                });
                // Delete completed task from outbox
                await db.sync_queue.delete(item.uuid);
            } catch (err) {
                console.error(`Failed to sync queue item ${item.uuid}:`, err);
                const nextAttempts = (item.attempts || 0) + 1;
                await db.sync_queue.update(item.uuid, {
                    status: nextAttempts >= 10 ? 'FAILED' : 'PENDING',
                    attempts: nextAttempts,
                    last_error: err.message
                });
            }
        }
    } finally {
        isSyncing = false;
        const remaining = await getPendingCount();
        broadcastSyncStatus({
            status: remaining > 0 ? 'PENDING' : 'ONLINE',
            pendingCount: remaining,
            lastSyncTime: new Date().toISOString()
        });
    }
}

/**
 * Handles individual sync item execution with cloud Supabase
 */
export async function processQueueItem(item, userId) {
    const { entity, action, payload } = item;

    switch (entity) {
        case 'sales': {
            if (action === 'CREATE') {
                const { sale, items } = payload;
                const idempotencyKey = item.idempotency_key || sale.uuid;

                // 1. Transactional Atomic RPC invocation
                const { data: rpcData, error: rpcErr } = await supabase.rpc('sync_sale_offline', {
                    p_client_uuid: sale.uuid,
                    p_idempotency_key: idempotencyKey,
                    p_cart: items.map(si => ({
                        product_id: si.product_id || null,
                        product_uuid: si.product_uuid || null,
                        id: si.product_id || null,
                        product_name: si.product_name,
                        quantity: si.quantity,
                        selling_price: si.selling_price,
                        cost_price: si.cost_price,
                        movement_uuid: si.movement_uuid || null
                    })),
                    p_payment_method: sale.payment_method,
                    p_customer_id: sale.customer_id || null,
                    p_discount_type: sale.discount_type || null,
                    p_discount_value: sale.discount_value || 0,
                    p_created_at: sale.date || sale.created_at,
                    p_customer_uuid: sale.customer_uuid || null
                });

                if (rpcErr) throw rpcErr;
                if (!rpcData || !rpcData.success) {
                    throw new Error(rpcData?.error || 'sync_sale_offline failed on remote server');
                }

                // 2. Update local Dexie records only upon verified cloud confirmation
                await db.sales.update(sale.uuid, { id: rpcData.saleId, sync_status: 'SYNCED' });

                // Mark associated inventory movements as SYNCED
                await db.inventory_movements
                    .where('reference_uuid')
                    .equals(sale.uuid)
                    .modify({ sync_status: 'SYNCED' });
            } else if (action === 'REFUND') {
                if (payload.sale_id) {
                    await supabase.rpc('refund_sale', { p_sale_id: payload.sale_id });
                }
            }
            break;
        }

        case 'purchases': {
            if (action === 'CREATE') {
                const { purchase, items } = payload;
                const idempotencyKey = item.idempotency_key || purchase.uuid;

                // 1. Try atomic RPC sync_purchase_offline first
                let rpcHandled = false;
                try {
                    const { data: rpcData, error: rpcErr } = await supabase.rpc('sync_purchase_offline', {
                        p_client_uuid: purchase.uuid,
                        p_idempotency_key: idempotencyKey,
                        p_items: items.map(pi => ({
                            product_id: pi.product_id || null,
                            product_uuid: pi.product_uuid || null,
                            id: pi.product_id || null,
                            product_name: pi.product_name,
                            quantity: pi.quantity,
                            purchase_price: pi.purchase_price,
                            movement_uuid: pi.movement_uuid || null
                        })),
                        p_total_cost: purchase.total_cost,
                        p_supplier_id: purchase.supplier_id || null,
                        p_supplier_uuid: purchase.supplier_uuid || null,
                        p_notes: purchase.notes || '',
                        p_created_at: purchase.date || purchase.created_at
                    });

                    if (!rpcErr && rpcData && rpcData.success) {
                        rpcHandled = true;
                        await db.purchases.update(purchase.uuid, { id: rpcData.purchaseId, sync_status: 'SYNCED' });
                        await db.inventory_movements
                            .where('reference_uuid')
                            .equals(purchase.uuid)
                            .modify({ sync_status: 'SYNCED' });
                        return;
                    }
                } catch {
                    // Fallback to table insert if RPC not yet deployed
                }

                if (!rpcHandled) {
                    // 2. Strict idempotency check using exact idempotency_key or client_uuid via maybeSingle()
                    const { data: existing } = await supabase
                        .from('purchases')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('idempotency_key', idempotencyKey)
                        .maybeSingle();

                    if (existing) {
                        await db.purchases.update(purchase.uuid, { id: existing.id, sync_status: 'SYNCED' });
                        await db.inventory_movements
                            .where('reference_uuid')
                            .equals(purchase.uuid)
                            .modify({ sync_status: 'SYNCED' });
                        return;
                    }

                    // Insert purchase header with client_uuid and idempotency_key
                    const { data: insertedPurch, error: purchErr } = await supabase
                        .from('purchases')
                        .insert({
                            user_id: userId,
                            client_uuid: purchase.uuid,
                            idempotency_key: idempotencyKey,
                            supplier_id: purchase.supplier_id || null,
                            date: purchase.date,
                            total_cost: purchase.total_cost,
                            notes: purchase.notes || ''
                        })
                        .select()
                        .single();

                    if (purchErr) throw purchErr;

                    // Insert purchase items
                    const purchaseItemInserts = items.map(pi => ({
                        user_id: userId,
                        purchase_id: insertedPurch.id,
                        product_id: pi.product_id || null,
                        product_name: pi.product_name,
                        quantity: pi.quantity,
                        purchase_price: pi.purchase_price
                    }));

                    const { error: piErr } = await supabase.from('purchase_items').insert(purchaseItemInserts);
                    if (piErr) throw piErr;

                    // Update local purchase record
                    await db.purchases.update(purchase.uuid, { id: insertedPurch.id, sync_status: 'SYNCED' });

                    // Mark associated inventory movements as SYNCED
                    await db.inventory_movements
                        .where('reference_uuid')
                        .equals(purchase.uuid)
                        .modify({ sync_status: 'SYNCED' });
                }
            } else if (action === 'DELETE') {
                await db.inventory_movements
                    .where('reference_uuid')
                    .equals(purchase.uuid)
                    .modify({ sync_status: 'SYNCED' });
            } else if (action === 'DELETE') {
                if (payload.id) {
                    await supabase.rpc('delete_purchase', { p_purchase_id: payload.id });
                }
            }
            break;
        }

        case 'products': {
            if (action === 'CREATE') {
                const { data, error } = await supabase.from('products').insert({
                    user_id: userId,
                    name: payload.name,
                    selling_price: payload.selling_price,
                    cost_price: payload.cost_price,
                    stock_quantity: payload.stock_quantity,
                    category: payload.category,
                    frequently_used: payload.frequently_used,
                    barcode: payload.barcode
                }).select().single();
                if (error) throw error;
                await db.products.update(payload.uuid, { id: data.id, sync_status: 'SYNCED' });
            } else if (action === 'UPDATE') {
                if (payload.id) {
                    await supabase.from('products').update({
                        name: payload.name,
                        selling_price: payload.selling_price,
                        cost_price: payload.cost_price,
                        stock_quantity: payload.stock_quantity,
                        category: payload.category,
                        frequently_used: payload.frequently_used,
                        barcode: payload.barcode,
                        updated_at: payload.updated_at
                    }).eq('id', payload.id);
                }
                await db.products.update(payload.uuid, { sync_status: 'SYNCED' });
            } else if (action === 'DELETE') {
                if (payload.id) {
                    await supabase.from('products').delete().eq('id', payload.id);
                }
                await db.products.delete(payload.uuid);
            }
            break;
        }

        case 'customers': {
            if (action === 'CREATE') {
                const { data, error } = await supabase.from('customers').insert({
                    user_id: userId,
                    name: payload.name,
                    phone: payload.phone,
                    balance: payload.balance,
                    client_uuid: payload.uuid
                }).select().single();
                if (error) throw error;
                await db.customers.update(payload.uuid, { id: data.id, sync_status: 'SYNCED' });
            } else if (action === 'UPDATE_BALANCE') {
                let resolvedCustomerId = payload.customer_id;

                // Resolve customer by client_uuid if customer was created offline
                if (!resolvedCustomerId && payload.customer_uuid) {
                    const localCust = await db.customers.get(payload.customer_uuid);
                    if (localCust && localCust.id) {
                        resolvedCustomerId = localCust.id;
                    } else {
                        const { data: cloudCust } = await supabase
                            .from('customers')
                            .select('id')
                            .eq('client_uuid', payload.customer_uuid)
                            .eq('user_id', userId)
                            .maybeSingle();
                        if (cloudCust && cloudCust.id) {
                            resolvedCustomerId = cloudCust.id;
                            await db.customers.update(payload.customer_uuid, { id: cloudCust.id });
                        }
                    }
                }

                const idempotencyKey = item.idempotency_key || `settle_${payload.sale_uuid || payload.customer_uuid}`;

                // Idempotency check: verify if settlement record already exists
                const { data: existingSettle } = await supabase
                    .from('sales')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('idempotency_key', idempotencyKey)
                    .maybeSingle();

                if (!existingSettle) {
                    // Update cloud customer balance if customer ID is resolved
                    if (resolvedCustomerId) {
                        const { error: custUpdErr } = await supabase.from('customers').update({
                            balance: payload.new_balance,
                            updated_at: new Date().toISOString()
                        }).eq('id', resolvedCustomerId).eq('user_id', userId);
                        if (custUpdErr) throw custUpdErr;
                    }

                    // Insert settlement transaction record into cloud sales table
                    const { error: settleErr } = await supabase.from('sales').insert({
                        user_id: userId,
                        date: payload.date || new Date().toISOString(),
                        total: 0,
                        subtotal: 0,
                        discount_amount: 0,
                        discount_value: 0,
                        profit: 0,
                        payment_method: 'Settle',
                        refunded: false,
                        customer_id: resolvedCustomerId || null,
                        item_count: 0,
                        settle_amount: payload.settle_amount,
                        client_uuid: payload.sale_uuid || null,
                        idempotency_key: idempotencyKey
                    });
                    if (settleErr) throw settleErr;
                }

                await db.customers.update(payload.customer_uuid, { sync_status: 'SYNCED' });
                if (payload.sale_uuid) {
                    await db.sales.update(payload.sale_uuid, { sync_status: 'SYNCED' });
                }
            }
            break;
        }

        case 'suppliers': {
            if (action === 'CREATE') {
                const { data, error } = await supabase.from('suppliers').insert({
                    user_id: userId,
                    name: payload.name,
                    phone: payload.phone,
                    address: payload.address,
                    notes: payload.notes
                }).select().single();
                if (error) throw error;
                await db.suppliers.update(payload.uuid, { id: data.id, sync_status: 'SYNCED' });
            } else if (action === 'UPDATE') {
                if (payload.id) {
                    await supabase.from('suppliers').update({
                        name: payload.name,
                        phone: payload.phone,
                        address: payload.address,
                        notes: payload.notes,
                        updated_at: payload.updated_at
                    }).eq('id', payload.id);
                }
                await db.suppliers.update(payload.uuid, { sync_status: 'SYNCED' });
            } else if (action === 'DELETE') {
                if (payload.id) {
                    await supabase.from('suppliers').delete().eq('id', payload.id);
                }
                await db.suppliers.delete(payload.uuid);
            }
            break;
        }

        case 'expenses': {
            if (action === 'CREATE') {
                const { data, error } = await supabase.from('expenses').insert({
                    user_id: userId,
                    type: payload.type,
                    amount: payload.amount,
                    date: payload.date,
                    note: payload.note
                }).select().single();
                if (error) throw error;
                await db.expenses.update(payload.uuid, { id: data.id, sync_status: 'SYNCED' });
            } else if (action === 'DELETE') {
                if (payload.id) {
                    await supabase.from('expenses').delete().eq('id', payload.id);
                }
                await db.expenses.delete(payload.uuid);
            }
            break;
        }

        case 'settings': {
            if (action === 'UPDATE') {
                await supabase.from('settings').upsert({
                    key: payload.key,
                    value: payload.value,
                    user_id: userId
                });
                await db.settings.update(payload.key, { sync_status: 'SYNCED' });
            }
            break;
        }

        default:
            console.warn(`Unknown sync entity: ${entity}`);
    }
}

/**
 * Downloads cloud snapshot into local Dexie database
 * Hydrates: Products, Categories, Customers, Suppliers, Settings,
 * Sales (60 days), Sale Items, Purchases (60 days), Purchase Items, Expenses (60 days).
 * Never overwrites local stock when pending inventory movements exist.
 */
export async function syncInbound() {
    if (!navigator.onLine) return;
    const userId = await getActiveUserId();
    if (!userId) return;

    try {
        // 1. Sync Products (with delta-based stock reconciliation)
        const { data: cloudProducts } = await supabase.from('products').select('*').eq('user_id', userId);
        if (cloudProducts) {
            for (const cp of cloudProducts) {
                const existing = await db.products.where('id').equals(cp.id).first();
                if (!existing) {
                    await db.products.put({
                        uuid: cp.client_uuid || `prod_${cp.id}`,
                        id: cp.id,
                        user_id: userId,
                        name: cp.name,
                        selling_price: cp.selling_price,
                        cost_price: cp.cost_price,
                        stock_quantity: cp.stock_quantity,
                        category: cp.category || 'General',
                        frequently_used: cp.frequently_used,
                        barcode: cp.barcode,
                        is_active: cp.is_active !== false,
                        sync_status: 'SYNCED',
                        created_at: cp.created_at,
                        updated_at: cp.updated_at
                    });
                } else {
                    // Check for pending (un-synced) inventory movements for this product
                    const pendingMovements = await db.inventory_movements
                        .where('product_uuid')
                        .equals(existing.uuid)
                        .and(m => m.sync_status === 'PENDING')
                        .toArray();

                    // Transaction-aware reconciliation: filter out any movement whose parent transaction was already confirmed
                    const unconfirmedMovements = [];
                    for (const pm of pendingMovements) {
                        if (pm.reference_uuid) {
                            const syncedSale = await db.sales.where('uuid').equals(pm.reference_uuid).and(s => s.sync_status === 'SYNCED').first();
                            const syncedPurch = await db.purchases.where('uuid').equals(pm.reference_uuid).and(p => p.sync_status === 'SYNCED').first();
                            if (syncedSale || syncedPurch) {
                                // Already incorporated into cloud snapshot: mark local movement SYNCED
                                await db.inventory_movements.update(pm.uuid, { sync_status: 'SYNCED' });
                                continue;
                            }
                        }
                        unconfirmedMovements.push(pm);
                    }

                    // Reconcile: apply only unconfirmed local deltas on top of cloud stock
                    const pendingDelta = unconfirmedMovements.reduce((sum, m) => sum + m.quantity_change, 0);
                    const reconciledStock = unconfirmedMovements.length > 0
                        ? cp.stock_quantity + pendingDelta
                        : (existing.sync_status === 'SYNCED' ? cp.stock_quantity : existing.stock_quantity);

                    await db.products.update(existing.uuid, {
                        id: cp.id,
                        name: existing.sync_status === 'SYNCED' ? cp.name : existing.name,
                        selling_price: existing.sync_status === 'SYNCED' ? cp.selling_price : existing.selling_price,
                        cost_price: existing.sync_status === 'SYNCED' ? cp.cost_price : existing.cost_price,
                        stock_quantity: reconciledStock,
                        category: cp.category || 'General',
                        barcode: cp.barcode || '',
                        is_active: cp.is_active !== false
                    });
                }
            }
        }

        // 2. Sync Customers & Outstanding Balances
        const { data: cloudCustomers } = await supabase.from('customers').select('*').eq('user_id', userId);
        if (cloudCustomers) {
            for (const cc of cloudCustomers) {
                const existing = await db.customers.where('id').equals(cc.id).first();
                if (!existing || existing.sync_status === 'SYNCED') {
                    await db.customers.put({
                        uuid: existing ? existing.uuid : (cc.client_uuid || `cust_${cc.id}`),
                        id: cc.id,
                        user_id: userId,
                        name: cc.name,
                        phone: cc.phone,
                        balance: cc.balance,
                        sync_status: 'SYNCED',
                        created_at: cc.created_at,
                        updated_at: cc.updated_at
                    });
                }
            }
        }

        // 3. Sync Suppliers
        const { data: cloudSuppliers } = await supabase.from('suppliers').select('*').eq('user_id', userId);
        if (cloudSuppliers) {
            for (const cs of cloudSuppliers) {
                const existing = await db.suppliers.where('id').equals(cs.id).first();
                if (!existing || existing.sync_status === 'SYNCED') {
                    await db.suppliers.put({
                        uuid: existing ? existing.uuid : (cs.client_uuid || `supp_${cs.id}`),
                        id: cs.id,
                        user_id: userId,
                        name: cs.name,
                        phone: cs.phone,
                        address: cs.address,
                        notes: cs.notes,
                        sync_status: 'SYNCED',
                        created_at: cs.created_at,
                        updated_at: cs.updated_at
                    });
                }
            }
        }

        // 4. Sync Settings
        const { data: cloudSettings } = await supabase.from('settings').select('*').eq('user_id', userId);
        if (cloudSettings) {
            for (const cs of cloudSettings) {
                await db.settings.put({
                    key: cs.key,
                    user_id: userId,
                    value: cs.value,
                    sync_status: 'SYNCED'
                });
            }
        }

        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

        // 5. Sync Sales (Last 60 Days) & Sale Items
        const { data: cloudSales } = await supabase
            .from('sales')
            .select('*')
            .eq('user_id', userId)
            .gte('date', sixtyDaysAgo);

        if (cloudSales && cloudSales.length > 0) {
            for (const cs of cloudSales) {
                const existing = await db.sales.where('id').equals(cs.id).first();
                if (!existing || existing.sync_status === 'SYNCED') {
                    await db.sales.put({
                        uuid: existing ? existing.uuid : (cs.client_uuid || `sale_${cs.id}`),
                        id: cs.id,
                        user_id: userId,
                        date: cs.date,
                        total: cs.total,
                        subtotal: cs.subtotal,
                        discount_amount: cs.discount_amount,
                        discount_type: cs.discount_type,
                        discount_value: cs.discount_value,
                        profit: cs.profit,
                        payment_method: cs.payment_method,
                        refunded: cs.refunded,
                        customer_id: cs.customer_id,
                        item_count: cs.item_count,
                        settle_amount: cs.settle_amount,
                        sync_status: 'SYNCED',
                        created_at: cs.created_at
                    });
                }
            }

            // Hydrate Sale Items for the downloaded sales
            const saleIds = cloudSales.map(s => s.id).filter(Boolean);
            if (saleIds.length > 0) {
                const { data: cloudItems } = await supabase
                    .from('sale_items')
                    .select('*')
                    .in('sale_id', saleIds);

                if (cloudItems) {
                    for (const ci of cloudItems) {
                        const matchingSale = cloudSales.find(s => s.id === ci.sale_id);
                        const saleUuid = matchingSale ? (matchingSale.client_uuid || `sale_${matchingSale.id}`) : String(ci.sale_id);
                        await db.sale_items.put({
                            uuid: `si_${ci.id}`,
                            id: ci.id,
                            sale_uuid: saleUuid,
                            product_uuid: String(ci.product_id),
                            product_id: ci.product_id,
                            product_name: ci.product_name,
                            quantity: ci.quantity,
                            selling_price: ci.selling_price,
                            cost_price: ci.cost_price,
                            subtotal: ci.subtotal,
                            user_id: userId
                        });
                    }
                }
            }
        }

        // 6. Sync Purchases (Last 60 Days) & Purchase Items
        const { data: cloudPurchases } = await supabase
            .from('purchases')
            .select('*')
            .eq('user_id', userId)
            .gte('date', sixtyDaysAgo);

        if (cloudPurchases && cloudPurchases.length > 0) {
            for (const cp of cloudPurchases) {
                const existing = await db.purchases.where('id').equals(cp.id).first();
                if (!existing || existing.sync_status === 'SYNCED') {
                    await db.purchases.put({
                        uuid: existing ? existing.uuid : (cp.client_uuid || `purch_${cp.id}`),
                        id: cp.id,
                        user_id: userId,
                        supplier_uuid: (existing && existing.supplier_uuid) || cp.supplier_uuid || String(cp.supplier_id || ''),
                        supplier_id: cp.supplier_id,
                        date: cp.date,
                        total_cost: cp.total_cost,
                        notes: cp.notes,
                        sync_status: 'SYNCED',
                        created_at: cp.created_at
                    });
                }
            }

            // Hydrate Purchase Items
            const purchaseIds = cloudPurchases.map(p => p.id).filter(Boolean);
            if (purchaseIds.length > 0) {
                const { data: cloudPurchaseItems } = await supabase
                    .from('purchase_items')
                    .select('*')
                    .in('purchase_id', purchaseIds);

                if (cloudPurchaseItems) {
                    for (const cpi of cloudPurchaseItems) {
                        const matchingPurch = cloudPurchases.find(p => p.id === cpi.purchase_id);
                        const purchaseUuid = matchingPurch ? (matchingPurch.client_uuid || `purch_${matchingPurch.id}`) : String(cpi.purchase_id);
                        await db.purchase_items.put({
                            uuid: `pi_${cpi.id}`,
                            id: cpi.id,
                            purchase_uuid: purchaseUuid,
                            product_uuid: String(cpi.product_id),
                            product_id: cpi.product_id,
                            product_name: cpi.product_name,
                            quantity: cpi.quantity,
                            purchase_price: cpi.purchase_price,
                            user_id: userId
                        });
                    }
                }
            }
        }

        // 7. Sync Expenses (Last 60 Days)
        const { data: cloudExpenses } = await supabase
            .from('expenses')
            .select('*')
            .eq('user_id', userId)
            .gte('date', sixtyDaysAgo);

        if (cloudExpenses) {
            for (const ce of cloudExpenses) {
                const existing = await db.expenses.where('id').equals(ce.id).first();
                if (!existing || existing.sync_status === 'SYNCED') {
                    await db.expenses.put({
                        uuid: existing ? existing.uuid : (ce.client_uuid || `exp_${ce.id}`),
                        id: ce.id,
                        user_id: userId,
                        type: ce.type,
                        amount: ce.amount,
                        date: ce.date,
                        note: ce.note,
                        sync_status: 'SYNCED',
                        created_at: ce.created_at
                    });
                }
            }
        }

        // 8. Hydrate Inventory Movements (Last 60 Days)
        const { data: cloudMovements } = await supabase
            .from('inventory_movements')
            .select('*')
            .eq('user_id', userId)
            .gte('created_at', sixtyDaysAgo);

        if (cloudMovements && cloudMovements.length > 0) {
            for (const cm of cloudMovements) {
                const existing = await db.inventory_movements.get(cm.uuid);
                if (existing) {
                    if (existing.sync_status !== 'SYNCED') {
                        await db.inventory_movements.update(cm.uuid, { sync_status: 'SYNCED' });
                    }
                } else {
                    const existingRef = cm.reference_uuid
                        ? await db.inventory_movements.where('reference_uuid').equals(cm.reference_uuid).first()
                        : null;
                    if (existingRef) {
                        if (existingRef.sync_status !== 'SYNCED') {
                            await db.inventory_movements.update(existingRef.uuid, { sync_status: 'SYNCED' });
                        }
                    } else {
                        await db.inventory_movements.put({
                            uuid: cm.uuid,
                            product_uuid: cm.product_uuid || String(cm.product_id),
                            user_id: userId,
                            quantity_change: cm.quantity_change,
                            movement_type: cm.movement_type,
                            reference_uuid: cm.reference_uuid,
                            timestamp: cm.timestamp || cm.created_at,
                            sync_status: 'SYNCED'
                        });
                    }
                }
            }
        }

        // Update sync watermark
        await db.sync_metadata.put({
            key: 'last_inbound_sync',
            value: new Date().toISOString()
        });
    } catch (err) {
        console.error('Inbound sync error:', err);
    }
}

/**
 * Initializes listeners and starts background sync daemon
 */
export function startSyncEngine() {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
        broadcastSyncStatus({ status: 'ONLINE', message: 'Connection restored' });
        runControlledSync();
    };

    const handleOffline = () => {
        getPendingCount().then(pendingCount => {
            broadcastSyncStatus({
                status: 'OFFLINE',
                pendingCount,
                message: 'Operating in offline mode'
            });
        });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isNetworkAvailable()) {
            runControlledSync();
        }
    });

    // Initial check
    if (isNetworkAvailable()) {
        runControlledSync();
    } else {
        handleOffline();
    }

    // Periodic drain check every 30s
    if (!syncTimer) {
        syncTimer = setInterval(() => {
            if (isNetworkAvailable() && !isSyncing) {
                runControlledSync();
            }
        }, 30000);
    }
}
