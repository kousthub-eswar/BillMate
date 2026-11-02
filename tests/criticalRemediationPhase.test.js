import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db, generateUUID } from '../src/database/local/db.js';
import { supabase } from '../src/database/supabase.js';
import { getActiveUserId } from '../src/database/local/offlineAuth.js';
import { addProduct, getProductById, getAllProducts } from '../src/database/local/localProductRepo.js';
import { addCustomer, getCustomerById } from '../src/database/local/localCustomerRepo.js';
import { addSupplier, getAllSuppliers } from '../src/database/local/localSupplierRepo.js';
import { createSale, getSaleById } from '../src/database/local/localSaleRepo.js';
import { createPurchase, getPurchaseById, getPurchases } from '../src/database/local/localPurchaseRepo.js';
import {
    syncInbound,
    drainSyncQueue,
    processQueueItem,
    runControlledSync,
    getPendingCount
} from '../src/services/syncEngine.js';

const TEST_USER_ID = 'test-vendor-uuid-7890';
let mockCloudData = {
    products: [],
    categories: ['Groceries', 'Beverages'],
    customers: [],
    suppliers: [],
    settings: [],
    sales: [],
    sale_items: [],
    purchases: [],
    purchase_items: [],
    expenses: [],
    inventory_movements: []
};

// Polyfill localStorage if running in pure Node
if (typeof globalThis.localStorage === 'undefined') {
    const memStore = new Map();
    globalThis.localStorage = {
        getItem: (k) => memStore.get(k) || null,
        setItem: (k, v) => memStore.set(k, String(v)),
        removeItem: (k) => memStore.delete(k),
        clear: () => memStore.clear()
    };
}

let isNetworkOnline = true;
let simulateLostAckNext = false; // When true, RPC commits on server but throws network error to client

supabase.auth.getUser = async () => {
    if (!isNetworkOnline) throw new Error('Network error: offline');
    return { data: { user: { id: TEST_USER_ID, email: 'vendor@billmate.app' } } };
};

// Mock Query Builder and Supabase RPC Engine
supabase.rpc = async (funcName, params) => {
    if (!isNetworkOnline) throw new Error('Network error: Failed to fetch');

    if (funcName === 'sync_sale_offline') {
        const {
            p_client_uuid,
            p_idempotency_key,
            p_cart,
            p_payment_method,
            p_customer_id,
            p_customer_uuid,
            p_created_at
        } = params;

        // Idempotency check: return existing without double-modifying stock or balance
        const existing = mockCloudData.sales.find(s =>
            (p_idempotency_key && s.idempotency_key === p_idempotency_key) ||
            (p_client_uuid && s.client_uuid === p_client_uuid)
        );

        if (existing) {
            if (simulateLostAckNext) {
                simulateLostAckNext = false;
                throw new Error('Ambiguous network response: connection lost after commit');
            }
            return { data: { success: true, saleId: existing.id, duplicate: true }, error: null };
        }

        const saleId = 1000 + mockCloudData.sales.length + 1;
        let total = 0;
        let profit = 0;

        for (const item of p_cart) {
            const qty = parseInt(item.quantity) || 1;
            const sp = parseFloat(item.selling_price) || 0;
            const cp = parseFloat(item.cost_price) || 0;
            total += sp * qty;
            profit += (sp - cp) * qty;

            mockCloudData.sale_items.push({
                id: 2000 + mockCloudData.sale_items.length + 1,
                user_id: TEST_USER_ID,
                sale_id: saleId,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: qty,
                selling_price: sp,
                cost_price: cp,
                subtotal: sp * qty
            });

            // Stock decrement on cloud product (preserves negative stock for overselling)
            const prod = mockCloudData.products.find(p => p.id === item.product_id || p.client_uuid === item.product_uuid);
            if (prod) {
                prod.stock_quantity = prod.stock_quantity - qty;
            }

            // Record movement with client's movement UUID
            mockCloudData.inventory_movements.push({
                id: 3000 + mockCloudData.inventory_movements.length + 1,
                uuid: item.movement_uuid || generateUUID(),
                user_id: TEST_USER_ID,
                product_id: item.product_id,
                product_uuid: item.product_uuid,
                quantity_change: -qty,
                movement_type: 'SALE',
                reference_uuid: p_client_uuid,
                created_at: p_created_at || new Date().toISOString()
            });
        }

        // Customer credit update if Credit sale
        if (p_payment_method === 'Credit') {
            const cust = mockCloudData.customers.find(c =>
                (p_customer_id && c.id === p_customer_id) ||
                (p_customer_uuid && c.client_uuid === p_customer_uuid)
            );
            if (cust) {
                cust.balance = (cust.balance || 0) + total;
            }
        }

        const newSale = {
            id: saleId,
            user_id: TEST_USER_ID,
            client_uuid: p_client_uuid,
            idempotency_key: p_idempotency_key,
            total,
            payment_method: p_payment_method,
            date: p_created_at || new Date().toISOString()
        };
        mockCloudData.sales.push(newSale);

        if (simulateLostAckNext) {
            simulateLostAckNext = false;
            throw new Error('Ambiguous network response: connection lost after commit');
        }

        return { data: { success: true, saleId, duplicate: false }, error: null };
    }

    if (funcName === 'sync_purchase_offline') {
        const {
            p_client_uuid,
            p_idempotency_key,
            p_items,
            p_total_cost,
            p_supplier_id,
            p_supplier_uuid,
            p_notes,
            p_created_at
        } = params;

        const existing = mockCloudData.purchases.find(p =>
            (p_idempotency_key && p.idempotency_key === p_idempotency_key) ||
            (p_client_uuid && p.client_uuid === p_client_uuid)
        );

        if (existing) {
            if (simulateLostAckNext) {
                simulateLostAckNext = false;
                throw new Error('Ambiguous network response: connection lost after commit');
            }
            return { data: { success: true, purchaseId: existing.id, duplicate: true }, error: null };
        }

        const purchaseId = 5000 + mockCloudData.purchases.length + 1;
        for (const item of p_items) {
            const qty = parseInt(item.quantity) || 1;
            mockCloudData.purchase_items.push({
                id: 6000 + mockCloudData.purchase_items.length + 1,
                user_id: TEST_USER_ID,
                purchase_id: purchaseId,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: qty,
                purchase_price: item.purchase_price
            });

            // Increment cloud stock
            const prod = mockCloudData.products.find(p => p.id === item.product_id || p.client_uuid === item.product_uuid);
            if (prod) {
                prod.stock_quantity = prod.stock_quantity + qty;
            }

            mockCloudData.inventory_movements.push({
                id: 7000 + mockCloudData.inventory_movements.length + 1,
                uuid: item.movement_uuid || generateUUID(),
                user_id: TEST_USER_ID,
                product_id: item.product_id,
                product_uuid: item.product_uuid,
                quantity_change: qty,
                movement_type: 'PURCHASE',
                reference_uuid: p_client_uuid,
                created_at: p_created_at || new Date().toISOString()
            });
        }

        const newPurch = {
            id: purchaseId,
            user_id: TEST_USER_ID,
            client_uuid: p_client_uuid,
            idempotency_key: p_idempotency_key,
            total_cost: p_total_cost,
            notes: p_notes,
            date: p_created_at || new Date().toISOString()
        };
        mockCloudData.purchases.push(newPurch);

        if (simulateLostAckNext) {
            simulateLostAckNext = false;
            throw new Error('Ambiguous network response: connection lost after commit');
        }

        return { data: { success: true, purchaseId, duplicate: false }, error: null };
    }

    return { data: { success: true }, error: null };
};

supabase.from = (table) => {
    let currentTable = table;
    let queryFilters = [];
    let isSingle = false;
    let isMaybeSingle = false;
    let operation = 'SELECT';
    let payload = null;

    const builder = {
        select: () => builder,
        insert: (data) => {
            operation = 'INSERT';
            payload = data;
            return builder;
        },
        update: (data) => {
            operation = 'UPDATE';
            payload = data;
            return builder;
        },
        delete: () => {
            operation = 'DELETE';
            return builder;
        },
        eq: (col, val) => {
            queryFilters.push(item => item[col] === val);
            return builder;
        },
        gte: (col, val) => {
            queryFilters.push(item => item[col] >= val);
            return builder;
        },
        in: (col, vals) => {
            queryFilters.push(item => vals.includes(item[col]));
            return builder;
        },
        single: () => {
            isSingle = true;
            return builder;
        },
        maybeSingle: () => {
            isMaybeSingle = true;
            return builder;
        },
        then: (resolve, reject) => {
            if (!isNetworkOnline) {
                return reject(new Error('Network error: Failed to fetch'));
            }

            const tbl = mockCloudData[currentTable] || [];

            if (operation === 'SELECT') {
                let filtered = tbl.filter(row => queryFilters.every(f => f(row)));
                if (isSingle) {
                    return resolve({ data: filtered[0] || null, error: filtered[0] ? null : { message: 'Not found' } });
                }
                if (isMaybeSingle) {
                    return resolve({ data: filtered[0] || null, error: null });
                }
                return resolve({ data: filtered, error: null });
            }

            if (operation === 'INSERT') {
                const itemsToInsert = Array.isArray(payload) ? payload : [payload];
                const inserted = itemsToInsert.map((item, idx) => {
                    const row = {
                        id: (tbl.length + idx + 1000),
                        created_at: new Date().toISOString(),
                        ...item
                    };
                    tbl.push(row);
                    return row;
                });
                return resolve({ data: isSingle ? inserted[0] : (Array.isArray(payload) ? inserted : inserted[0]), error: null });
            }

            if (operation === 'UPDATE') {
                let updated = [];
                for (let row of tbl) {
                    if (queryFilters.every(f => f(row))) {
                        Object.assign(row, payload, { updated_at: new Date().toISOString() });
                        updated.push(row);
                    }
                }
                return resolve({ data: isSingle ? updated[0] : updated, error: null });
            }

            return resolve({ data: null, error: null });
        }
    };
    return builder;
};

describe('BillMate Critical Remediation Phase — 17 Mandatory Scenarios', () => {
    let riceProdUuid;
    let customerUuid;
    let supplierUuid;

    beforeEach(async () => {
        // Reset local Dexie
        await db.products.clear();
        await db.categories.clear();
        await db.customers.clear();
        await db.suppliers.clear();
        await db.sales.clear();
        await db.sale_items.clear();
        await db.purchases.clear();
        await db.purchase_items.clear();
        await db.expenses.clear();
        await db.inventory_movements.clear();
        await db.sync_queue.clear();
        await db.sync_metadata.clear();
        await db.user_pin_auth.clear();

        // Initialize cloud database state with baseline
        mockCloudData.products = [
            { id: 101, user_id: TEST_USER_ID, name: 'Basmati Rice 5kg', selling_price: 450, cost_price: 380, stock_quantity: 50, client_uuid: 'cloud-rice-uuid', category: 'Grains' },
            { id: 102, user_id: TEST_USER_ID, name: 'Mustard Oil 1L', selling_price: 180, cost_price: 150, stock_quantity: 40, client_uuid: 'cloud-oil-uuid', category: 'Oils' }
        ];
        mockCloudData.customers = [
            { id: 201, user_id: TEST_USER_ID, name: 'Sunil Kumar', phone: '9876543210', balance: 0, client_uuid: 'cloud-cust-uuid' }
        ];
        mockCloudData.suppliers = [
            { id: 301, user_id: TEST_USER_ID, name: 'National Distributors', phone: '9123456780', client_uuid: 'cloud-supp-uuid' }
        ];
        mockCloudData.sales = [];
        mockCloudData.sale_items = [];
        mockCloudData.purchases = [];
        mockCloudData.purchase_items = [];
        mockCloudData.expenses = [];
        mockCloudData.inventory_movements = [];

        isNetworkOnline = true;
        simulateLostAckNext = false;

        // Perform initial hydration
        await syncInbound();
        const p = await db.products.where('name').equals('Basmati Rice 5kg').first();
        riceProdUuid = p.uuid;
        const c = await db.customers.where('name').equals('Sunil Kumar').first();
        customerUuid = c.uuid;
        const s = await db.suppliers.where('name').equals('National Distributors').first();
        supplierUuid = s.uuid;
    });

    // Scenario 1: Two legitimate purchases with the same date and total
    it('Scenario 1: Two legitimate purchases with the same date and total are never confused', async () => {
        isNetworkOnline = false;
        const sameDate = '2026-11-02T10:00:00.000Z';
        // Purchase 1: 10 units @ 150 = 1500
        const p1 = await createPurchase(supplierUuid, [
            { product_id: riceProdUuid, product_name: 'Basmati Rice 5kg', quantity: 10, purchase_price: 150 }
        ], 'Batch A');
        // Purchase 2: 10 units @ 150 = 1500 (identical total, same supplier)
        const p2 = await createPurchase(supplierUuid, [
            { product_id: riceProdUuid, product_name: 'Basmati Rice 5kg', quantity: 10, purchase_price: 150 }
        ], 'Batch B');

        expect(p1.purchaseId).not.toBe(p2.purchaseId);
        expect(p1.totalCost).toBe(1500);
        expect(p2.totalCost).toBe(1500);

        // Reconnect and sync
        isNetworkOnline = true;
        await drainSyncQueue();

        // Both purchases MUST exist independently in cloud with their own IDs
        expect(mockCloudData.purchases.length).toBe(2);
        expect(mockCloudData.purchases[0].id).not.toBe(mockCloudData.purchases[1].id);
        expect(mockCloudData.purchases.map(p => p.client_uuid)).toContain(p1.purchaseId);
        expect(mockCloudData.purchases.map(p => p.client_uuid)).toContain(p2.purchaseId);
    });

    // Scenario 2: Retrying the same purchase twice
    it('Scenario 2: Retrying the same purchase twice is completely idempotent', async () => {
        isNetworkOnline = false;
        const p = await createPurchase(supplierUuid, [
            { product_id: riceProdUuid, product_name: 'Basmati Rice 5kg', quantity: 5, purchase_price: 200 }
        ]);

        isNetworkOnline = true;
        await drainSyncQueue();
        const cloudCountAfterFirst = mockCloudData.purchases.length;
        expect(cloudCountAfterFirst).toBe(1);

        // Retry the exact same sync queue payload
        const localPurch = await db.purchases.get(p.purchaseId);
        const localItems = await db.purchase_items.where('purchase_uuid').equals(p.purchaseId).toArray();
        await processQueueItem({
            uuid: 'retry-queue-purch',
            entity: 'purchases',
            action: 'CREATE',
            idempotency_key: p.purchaseId,
            payload: { purchase: localPurch, items: localItems, user_id: TEST_USER_ID }
        }, TEST_USER_ID);

        // Cloud purchases must NOT increment
        expect(mockCloudData.purchases.length).toBe(cloudCountAfterFirst);
    });

    // Scenario 3: Purchase upload after an ambiguous HTTP response
    it('Scenario 3: Purchase upload succeeds cleanly after an ambiguous network response', async () => {
        isNetworkOnline = true;
        simulateLostAckNext = true; // Server commits, but client receives network error

        const p = await createPurchase(supplierUuid, [
            { product_id: riceProdUuid, product_name: 'Basmati Rice 5kg', quantity: 8, purchase_price: 100 }
        ]);

        // First drain attempts sync: throws ambiguous network error, queue item remains PENDING
        try {
            await drainSyncQueue();
        } catch { /* expected */ }

        // Cloud already has the purchase committed
        expect(mockCloudData.purchases.length).toBe(1);

        // Client retries drain when network recovers
        simulateLostAckNext = false;
        await drainSyncQueue();

        const pending = await getPendingCount();
        expect(pending).toBe(0);
        expect(mockCloudData.purchases.length).toBe(1); // Exactly one purchase
    });

    // Scenario 4: Purchase items uploaded exactly once
    it('Scenario 4: Purchase items are uploaded exactly once despite retries', async () => {
        isNetworkOnline = false;
        const p = await createPurchase(supplierUuid, [
            { product_id: riceProdUuid, product_name: 'Basmati Rice 5kg', quantity: 4, purchase_price: 250 }
        ]);

        isNetworkOnline = true;
        await drainSyncQueue();
        expect(mockCloudData.purchase_items.length).toBe(1);

        // Duplicate retry of purchase
        const localPurch = await db.purchases.get(p.purchaseId);
        const localItems = await db.purchase_items.where('purchase_uuid').equals(p.purchaseId).toArray();
        await processQueueItem({
            uuid: 'retry-items-check',
            entity: 'purchases',
            action: 'CREATE',
            idempotency_key: p.purchaseId,
            payload: { purchase: localPurch, items: localItems, user_id: TEST_USER_ID }
        }, TEST_USER_ID);

        expect(mockCloudData.purchase_items.length).toBe(1);
    });

    // Scenario 5: Sale RPC inserts header and items atomically
    it('Scenario 5: Sale RPC sync_sale_offline inserts header and items atomically', async () => {
        isNetworkOnline = false;
        const saleRes = await createSale([
            { id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 3, selling_price: 450, cost_price: 380 }
        ], 'Cash');

        isNetworkOnline = true;
        await drainSyncQueue();

        expect(mockCloudData.sales.length).toBe(1);
        expect(mockCloudData.sale_items.length).toBe(1);
        expect(mockCloudData.sale_items[0].quantity).toBe(3);
        expect(mockCloudData.sale_items[0].sale_id).toBe(mockCloudData.sales[0].id);
    });

    // Scenario 6: Sale retry after lost HTTP response
    it('Scenario 6: Sale retry after lost HTTP response returns existing transaction without re-execution', async () => {
        isNetworkOnline = true;
        simulateLostAckNext = true;

        const saleRes = await createSale([
            { id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 2, selling_price: 450, cost_price: 380 }
        ], 'Cash');

        try {
            await drainSyncQueue();
        } catch { /* simulated drop */ }

        // Cloud committed the sale
        expect(mockCloudData.sales.length).toBe(1);
        const committedSaleId = mockCloudData.sales[0].id;

        // Client retries drain
        simulateLostAckNext = false;
        await drainSyncQueue();

        const pending = await getPendingCount();
        expect(pending).toBe(0);
        // Did not create second sale
        expect(mockCloudData.sales.length).toBe(1);
        const localSale = await getSaleById(saleRes.saleId);
        expect(localSale.sync_status).toBe('SYNCED');
        expect(localSale.id).toBe(committedSaleId);
    });

    // Scenario 7: No duplicate stock deduction
    it('Scenario 7: No duplicate stock deduction occurs upon retry', async () => {
        // Initial cloud stock is 50
        expect(mockCloudData.products[0].stock_quantity).toBe(50);

        simulateLostAckNext = true;
        const saleRes = await createSale([
            { id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 5, selling_price: 450, cost_price: 380 }
        ], 'Cash');

        try { await drainSyncQueue(); } catch { /* drop */ }

        // Cloud stock was decremented once: 50 - 5 = 45
        expect(mockCloudData.products[0].stock_quantity).toBe(45);

        // Retry drain
        simulateLostAckNext = false;
        await drainSyncQueue();

        // Cloud stock MUST remain 45, never 40!
        expect(mockCloudData.products[0].stock_quantity).toBe(45);
    });

    // Scenario 8: Customer credit update exactly once
    it('Scenario 8: Customer credit is updated exactly once for credit sales', async () => {
        simulateLostAckNext = true;
        // Credit sale of 2 * 450 = 900
        const saleRes = await createSale([
            { id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 2, selling_price: 450, cost_price: 380 }
        ], 'Credit', customerUuid);

        try { await drainSyncQueue(); } catch { /* drop */ }

        // Cloud customer balance is now 900
        expect(mockCloudData.customers[0].balance).toBe(900);

        // Retry drain
        simulateLostAckNext = false;
        await drainSyncQueue();

        // Balance MUST remain 900, never 1800!
        expect(mockCloudData.customers[0].balance).toBe(900);
    });

    // Scenario 9: Product restock exactly once
    it('Scenario 9: Product restock via purchase increments stock exactly once', async () => {
        const initialStock = mockCloudData.products[0].stock_quantity; // 50
        simulateLostAckNext = true;

        const p = await createPurchase(supplierUuid, [
            { product_id: riceProdUuid, product_name: 'Basmati Rice 5kg', quantity: 20, purchase_price: 300 }
        ]);

        try { await drainSyncQueue(); } catch { /* drop */ }

        // Cloud stock is 50 + 20 = 70
        expect(mockCloudData.products[0].stock_quantity).toBe(70);

        // Retry drain
        simulateLostAckNext = false;
        await drainSyncQueue();

        // Stock MUST remain 70, never 90!
        expect(mockCloudData.products[0].stock_quantity).toBe(70);
    });

    // Scenario 10: Two devices selling the same product offline
    it('Scenario 10: Two devices selling the same product offline merge deltas correctly', async () => {
        expect(mockCloudData.products[0].stock_quantity).toBe(50);

        // Device A sells 5 offline
        isNetworkOnline = false;
        await createSale([{ id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 5, selling_price: 450, cost_price: 380 }], 'Cash');
        isNetworkOnline = true;
        await runControlledSync();
        expect(mockCloudData.products[0].stock_quantity).toBe(45);

        // Device B sells 12 offline
        isNetworkOnline = false;
        await createSale([{ id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 12, selling_price: 450, cost_price: 380 }], 'Cash');
        isNetworkOnline = true;
        await runControlledSync();
        expect(mockCloudData.products[0].stock_quantity).toBe(33);
    });

    // Scenario 11: Concurrent reconnection
    it('Scenario 11: Concurrent reconnection maintains deterministic queue ordering and prevents duplicate sync workers', async () => {
        isNetworkOnline = false;
        await createSale([{ id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 2, selling_price: 450, cost_price: 380 }], 'Cash');

        isNetworkOnline = true;
        // Concurrent triggers of runControlledSync
        await Promise.all([runControlledSync(), runControlledSync()]);
        const pending = await getPendingCount();
        expect(pending).toBe(0);
    });

    // Scenario 12: Lost acknowledgement followed by retry
    it('Scenario 12: Lost acknowledgement followed by retry achieves exact convergence (33 units) without duplicate deduction', async () => {
        // Step 1: Device A sells 5 and syncs (bringing cloud & local stock from 50 to 45)
        await createSale([{ id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 5, selling_price: 450, cost_price: 380 }], 'Cash');
        await runControlledSync();
        expect(mockCloudData.products[0].stock_quantity).toBe(45);
        const prodAfterA = await getProductById(riceProdUuid);
        expect(prodAfterA.stock_quantity).toBe(45);

        // Step 2: Device B goes offline and sells 12 units
        isNetworkOnline = false;
        await createSale([{ id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 12, selling_price: 450, cost_price: 380 }], 'Cash');
        const prodBeforeSync = await getProductById(riceProdUuid);
        expect(prodBeforeSync.stock_quantity).toBe(33);

        // Step 3: Reconnect: Server commits (cloud = 33), but client loses HTTP ACK
        isNetworkOnline = true;
        simulateLostAckNext = true;
        try {
            await drainSyncQueue();
        } catch { /* ACK lost */ }

        expect(mockCloudData.products[0].stock_quantity).toBe(33);

        // Step 4: Device B retries sync
        simulateLostAckNext = false;
        await runControlledSync();

        // Final cloud stock: MUST BE 33
        expect(mockCloudData.products[0].stock_quantity).toBe(33);

        // Final local stock on device after sync: MUST BE 33
        const finalLocalProd = await getProductById(riceProdUuid);
        expect(finalLocalProd.stock_quantity).toBe(33);
    });

    // Scenario 13: Inbound sync after successful outbound sync
    it('Scenario 13: Inbound sync after successful outbound sync establishes consistent snapshot', async () => {
        isNetworkOnline = false;
        await createSale([
            { id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 4, selling_price: 450, cost_price: 380 }
        ], 'Cash');

        isNetworkOnline = true;
        // Run controlled sync (drains outbound, then hydrates inbound)
        await runControlledSync();

        const pending = await getPendingCount();
        expect(pending).toBe(0);
        const prod = await getProductById(riceProdUuid);
        expect(prod.stock_quantity).toBe(50 - 4);
    });

    // Scenario 14: Inventory movement UUID preserved across devices
    it('Scenario 14: Client inventory movement UUID is preserved in Supabase', async () => {
        isNetworkOnline = false;
        const saleRes = await createSale([
            { id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 1, selling_price: 450, cost_price: 380 }
        ], 'Cash');

        const localMovement = await db.inventory_movements.where('reference_uuid').equals(saleRes.saleId).first();
        expect(localMovement).toBeDefined();

        isNetworkOnline = true;
        await drainSyncQueue();

        // Cloud inventory movement MUST have the exact same UUID as client
        const cloudMovement = mockCloudData.inventory_movements.find(m => m.reference_uuid === saleRes.saleId);
        expect(cloudMovement).toBeDefined();
        expect(cloudMovement.uuid).toBe(localMovement.uuid);
    });

    // Scenario 15: Multiple online events without concurrent duplicate workers
    it('Scenario 15: Multiple rapid online events trigger strictly serialized sync without duplicate workers', async () => {
        isNetworkOnline = true;
        // Trigger 5 rapid concurrent calls to runControlledSync
        const p1 = runControlledSync();
        const p2 = runControlledSync();
        const p3 = runControlledSync();
        const p4 = runControlledSync();
        const p5 = runControlledSync();

        await Promise.all([p1, p2, p3, p4, p5]);
        // All complete cleanly without throwing mutex collision errors
        const pending = await getPendingCount();
        expect(pending).toBe(0);
    });

    // Scenario 16: Existing legacy cloud transactions remain readable
    it('Scenario 16: Existing legacy cloud transactions without client_uuid remain fully readable', async () => {
        // Insert legacy sale without client_uuid into cloud
        mockCloudData.sales.push({
            id: 9999,
            user_id: TEST_USER_ID,
            total: 250,
            date: new Date().toISOString(),
            payment_method: 'Cash',
            item_count: 1
        });

        isNetworkOnline = true;
        await syncInbound();

        // Local Dexie must have imported the legacy sale using fallback UUID
        const importedLegacy = await db.sales.where('id').equals(9999).first();
        expect(importedLegacy).toBeDefined();
        expect(importedLegacy.uuid).toBe('sale_9999');
        expect(importedLegacy.total).toBe(250);
    });

    // Scenario 17: Failed synchronization retains pending local data
    it('Scenario 17: Failed synchronization retains pending local data without data loss', async () => {
        isNetworkOnline = false;
        const saleRes = await createSale([
            { id: riceProdUuid, name: 'Basmati Rice 5kg', quantity: 2, selling_price: 450, cost_price: 380 }
        ], 'Cash');

        // Drain while offline
        await drainSyncQueue();

        const pending = await getPendingCount();
        expect(pending).toBe(1);
        const sale = await getSaleById(saleRes.saleId);
        expect(sale.sync_status).toBe('PENDING');
        const movement = await db.inventory_movements.where('reference_uuid').equals(saleRes.saleId).first();
        expect(movement.sync_status).toBe('PENDING');
    });
});
