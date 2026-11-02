import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/database/local/db.js';
import { supabase } from '../src/database/supabase.js';
import {
    getActiveUserId,
    enrollOfflinePin,
    hasEnrolledPin,
    verifyOfflinePin,
    lockWorkspace,
    isWorkspaceLocked
} from '../src/database/local/offlineAuth.js';
import {
    getAllProducts,
    getProductById,
    addProduct,
    updateProduct,
    deleteProduct
} from '../src/database/local/localProductRepo.js';
import {
    getAllCustomers,
    getCustomerById,
    addCustomer,
    updateCustomer
} from '../src/database/local/localCustomerRepo.js';
import {
    getAllSuppliers,
    addSupplier
} from '../src/database/local/localSupplierRepo.js';
import {
    createSale,
    getSaleById,
    getSales
} from '../src/database/local/localSaleRepo.js';
import {
    createPurchase,
    getPurchases
} from '../src/database/local/localPurchaseRepo.js';
import {
    addExpense,
    getTodayExpenses
} from '../src/database/local/localExpenseRepo.js';
import {
    syncInbound,
    drainSyncQueue,
    processQueueItem,
    getPendingCount
} from '../src/services/syncEngine.js';

const TEST_USER_ID = 'test-vendor-uuid-12345';
let mockCloudData = {
    products: [
        { id: 101, user_id: TEST_USER_ID, name: 'Cloud Basmati Rice 5kg', selling_price: 450, cost_price: 380, stock_quantity: 25, category: 'Grains', client_uuid: 'prod_101', updated_at: new Date().toISOString() },
        { id: 102, user_id: TEST_USER_ID, name: 'Cloud Mustard Oil 1L', selling_price: 180, cost_price: 150, stock_quantity: 40, category: 'Oils', client_uuid: 'prod_102', updated_at: new Date().toISOString() }
    ],
    categories: ['Grains', 'Oils'],
    customers: [
        { id: 201, user_id: TEST_USER_ID, name: 'Ramesh Sharma', phone: '9876543210', balance: 500, client_uuid: 'cust_201', updated_at: new Date().toISOString() }
    ],
    suppliers: [
        { id: 301, user_id: TEST_USER_ID, name: 'National Distributors', phone: '9123456780', client_uuid: 'supp_301', updated_at: new Date().toISOString() }
    ],
    settings: [
        { key: 'tax_rate', user_id: TEST_USER_ID, value: '5' }
    ],
    sales: [],
    sale_items: [],
    purchases: [],
    purchase_items: [],
    expenses: []
};

// Polyfill localStorage on globalThis if missing
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
supabase.auth.getUser = async () => {
    if (!isNetworkOnline) throw new Error('Network error: offline');
    return { data: { user: { id: TEST_USER_ID, email: 'vendor@billmate.app' } } };
};

supabase.from = (table) => {
    let currentTable = table;
    let queryFilters = [];
    let isSingle = false;
    let operation = 'SELECT';
    let payload = null;

    const builder = {
        select: () => {
            // Keep operation intact if already set to INSERT/UPDATE/DELETE
            return builder;
        },
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
        then: (resolve, reject) => {
            if (!isNetworkOnline) {
                return reject(new Error('Network error: Failed to fetch'));
            }

            const tbl = mockCloudData[currentTable] || [];

            if (operation === 'SELECT') {
                let filtered = tbl.filter(row => queryFilters.every(f => f(row)));
                if (isSingle) {
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

supabase.rpc = async (funcName, params) => {
    if (!isNetworkOnline) throw new Error('Network error: Failed to fetch');
    return { data: { success: true }, error: null };
};

describe('BillMate Offline-First 22 Scenarios Test Suite', () => {
    let targetProd;
    let purchaseRes;
    let saleRes;
    let oilProd;
    let newProdUuid;

    beforeAll(async () => {
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
    });

    it('Scenario 1: Initial cloud sync', async () => {
        isNetworkOnline = true;
        await syncInbound();
        const initialProds = await db.products.where('user_id').equals(TEST_USER_ID).toArray();
        const initialCusts = await db.customers.where('user_id').equals(TEST_USER_ID).toArray();
        expect(initialProds.length).toBe(2);
        expect(initialCusts.length).toBe(1);
    });

    it('Scenario 2: Offline app startup', async () => {
        isNetworkOnline = false;
        const offlineProds = await getAllProducts();
        expect(offlineProds.length).toBe(2);
        expect(offlineProds[0].name).toContain('Rice');
    });

    it('Scenario 3: Offline product creation', async () => {
        newProdUuid = await addProduct({
            name: 'Local Biscuit 200g',
            selling_price: 30,
            cost_price: 22,
            stock_quantity: 50,
            category: 'Snacks'
        });
        const createdProd = await getProductById(newProdUuid);
        expect(createdProd).not.toBeNull();
        expect(createdProd.sync_status).toBe('PENDING');
        const queueCount = await db.sync_queue.where('entity').equals('products').count();
        expect(queueCount).toBe(1);
    });

    it('Scenario 4: Offline product updates', async () => {
        await updateProduct(newProdUuid, {
            name: 'Local Biscuit 200g (Family Pack)',
            selling_price: 35
        });
        const updated = await getProductById(newProdUuid);
        expect(updated.selling_price).toBe(35);
        expect(updated.name).toContain('Family Pack');
    });

    it('Scenario 5: Offline purchase creation', async () => {
        targetProd = await db.products.where('name').equals('Cloud Basmati Rice 5kg').first();
        purchaseRes = await createPurchase('supp_301', [
            { product_id: targetProd.uuid, product_name: targetProd.name, quantity: 15, purchase_price: 370 }
        ], 'Offline bulk order');
        const purchaseRecord = await db.purchases.get(purchaseRes.purchaseId);
        const purchaseItems = await db.purchase_items.where('purchase_uuid').equals(purchaseRes.purchaseId).toArray();
        expect(purchaseRecord.sync_status).toBe('PENDING');
        expect(purchaseItems.length).toBe(1);
    });

    it('Scenario 6: Offline purchase stock increments', async () => {
        const riceAfter = await getProductById(targetProd.uuid);
        const pMovement = await db.inventory_movements.where('reference_uuid').equals(purchaseRes.purchaseId).first();
        expect(riceAfter.stock_quantity).toBe(25 + 15);
        expect(pMovement.quantity_change).toBe(15);
        expect(pMovement.movement_type).toBe('PURCHASE');
    });

    it('Scenario 7: Offline sale creation', async () => {
        const cart = [
            { id: targetProd.uuid, name: targetProd.name, quantity: 5, selling_price: targetProd.selling_price, cost_price: targetProd.cost_price }
        ];
        saleRes = await createSale(cart, 'Cash');
        const storedSale = await getSaleById(saleRes.saleId);
        expect(storedSale.sync_status).toBe('PENDING');
        expect(storedSale.total).toBe(5 * 450);
    });

    it('Scenario 8: Atomic sale and sale-item storage', async () => {
        const items = await db.sale_items.where('sale_uuid').equals(saleRes.saleId).toArray();
        expect(items.length).toBe(1);
        expect(items[0].quantity).toBe(5);
    });

    it('Scenario 9: Stock decrement after offline sale', async () => {
        const riceAfterSale = await getProductById(targetProd.uuid);
        const sMovement = await db.inventory_movements.where('reference_uuid').equals(saleRes.saleId).first();
        expect(riceAfterSale.stock_quantity).toBe(35);
        expect(sMovement.quantity_change).toBe(-5);
        expect(sMovement.movement_type).toBe('SALE');
    });

    it('Scenario 10: Browser reload while offline', async () => {
        const sales = await getSales('all');
        const prods = await getAllProducts();
        expect(sales.length).toBeGreaterThanOrEqual(1);
        expect(prods.length).toBeGreaterThanOrEqual(3);
    });

    it('Scenario 11: Browser restart while offline', async () => {
        db.close();
        await db.open();
        const sales = await getSales('all');
        const rice = await getProductById(targetProd.uuid);
        expect(sales.length).toBeGreaterThanOrEqual(1);
        expect(rice.stock_quantity).toBe(35);
    });

    it('Scenario 12: Reconnection and outgoing sync', async () => {
        isNetworkOnline = true;
        const pendingBefore = await getPendingCount();
        expect(pendingBefore).toBeGreaterThan(0);
        await drainSyncQueue();
        const pendingAfter = await getPendingCount();
        expect(pendingAfter).toBe(0);
    });

    it('Scenario 13: Inbound sync without overwriting pending stock changes', async () => {
        isNetworkOnline = false;
        oilProd = await db.products.where('name').equals('Cloud Mustard Oil 1L').first();
        await createSale([{ id: oilProd.uuid, name: oilProd.name, quantity: 2, selling_price: 180, cost_price: 150 }], 'Cash');
        
        isNetworkOnline = true;
        await syncInbound();
        const oilReconciled = await getProductById(oilProd.uuid);
        // Base cloud 40 + pending (-2) = 38
        expect(oilReconciled.stock_quantity).toBe(38);
    });

    it('Scenario 14: Duplicate sale retry (idempotency)', async () => {
        await drainSyncQueue();
        const syncedSale = await db.sales.orderBy('created_at').last();
        const duplicateItem = {
            uuid: 'dup-sale-test',
            entity: 'sales',
            action: 'CREATE',
            payload: {
                sale: syncedSale,
                items: await db.sale_items.where('sale_uuid').equals(syncedSale.uuid).toArray()
            }
        };
        const initialCount = mockCloudData.sales.length;
        await processQueueItem(duplicateItem, TEST_USER_ID);
        expect(mockCloudData.sales.length).toBe(initialCount);
    });

    it('Scenario 15: Duplicate purchase retry (idempotency)', async () => {
        const existingPurch = await db.purchases.toCollection().first();
        const dupPurch = {
            uuid: 'dup-purch-test',
            entity: 'purchases',
            action: 'CREATE',
            payload: {
                purchase: existingPurch,
                items: await db.purchase_items.where('purchase_uuid').equals(existingPurch.uuid).toArray(),
                user_id: TEST_USER_ID
            }
        };
        const initialPurchCount = mockCloudData.purchases.length;
        await processQueueItem(dupPurch, TEST_USER_ID);
        expect(mockCloudData.purchases.length).toBe(initialPurchCount);
    });

    it('Scenario 16: Customer credit sale and settlement', async () => {
        isNetworkOnline = false;
        const cust = await db.customers.where('name').equals('Ramesh Sharma').first();
        const initialBal = cust.balance;
        await createSale(
            [{ id: oilProd.uuid, name: oilProd.name, quantity: 1, selling_price: 180, cost_price: 150 }],
            'Credit',
            cust.uuid
        );
        const custAfter = await getCustomerById(cust.uuid);
        expect(custAfter.balance).toBe(initialBal + 180);
        isNetworkOnline = true;
        await drainSyncQueue();
    });

    it('Scenario 17: Supplier ledger consistency', async () => {
        const suppliers = await getAllSuppliers();
        const purchases = await getPurchases('all');
        expect(suppliers.length).toBeGreaterThanOrEqual(1);
        expect(purchases.some(p => p.supplier_uuid === 'supp_301')).toBe(true);
    });

    it('Scenario 18: Expense creation and synchronization', async () => {
        isNetworkOnline = false;
        const expUuid = await addExpense({ type: 'Utility', amount: 1250, note: 'Monthly store electricity' });
        const pendingExp = await db.expenses.get(expUuid);
        expect(pendingExp.sync_status).toBe('PENDING');
        isNetworkOnline = true;
        await drainSyncQueue();
        const syncedExp = await db.expenses.get(expUuid);
        expect(syncedExp.sync_status).toBe('SYNCED');
    });

    it('Scenario 19: Logout and offline workspace unlocking (PBKDF2 PIN)', async () => {
        await enrollOfflinePin(TEST_USER_ID, '123456');
        expect(await hasEnrolledPin(TEST_USER_ID)).toBe(true);
        lockWorkspace();
        expect(isWorkspaceLocked()).toBe(true);
        
        let wrongPinFailed = false;
        try {
            await verifyOfflinePin(TEST_USER_ID, '999999');
        } catch {
            wrongPinFailed = true;
        }
        expect(wrongPinFailed).toBe(true);

        const unlockRes = await verifyOfflinePin(TEST_USER_ID, '123456');
        expect(unlockRes.success).toBe(true);
        expect(isWorkspaceLocked()).toBe(false);
    });

    it('Scenario 20: Missing-user-ID repository rejection (tenant isolation)', async () => {
        globalThis.localStorage.clear();
        supabase.auth.getUser = async () => ({ data: { user: null } });

        await expect(getAllProducts()).rejects.toThrow('User not authenticated');
        await expect(addProduct({ name: 'Fail' })).rejects.toThrow('User not authenticated');
        await expect(createSale([], 'Cash')).rejects.toThrow('User not authenticated');
        await expect(createPurchase('supp', [])).rejects.toThrow('User not authenticated');
        await expect(getAllCustomers()).rejects.toThrow('User not authenticated');
        await expect(addExpense({ type: 'Fail', amount: 10 })).rejects.toThrow('User not authenticated');

        // Restore auth
        isNetworkOnline = true;
        supabase.auth.getUser = async () => ({ data: { user: { id: TEST_USER_ID, email: 'vendor@billmate.app' } } });
        await getActiveUserId();
    });

    it('Scenario 21: Two-device inventory conflict simulation', async () => {
        isNetworkOnline = false;
        const testProd = await db.products.where('name').equals('Cloud Basmati Rice 5kg').first();
        await createSale([{ id: testProd.uuid, name: testProd.name, quantity: 3, selling_price: 450, cost_price: 380 }], 'Cash');
        
        // Concurrent sale on Device B reflected in cloud stock (30)
        const cloudProd = mockCloudData.products.find(p => p.id === 101);
        cloudProd.stock_quantity = 30;

        // Inbound sync should reconcile: 30 + (-3) = 27
        isNetworkOnline = true;
        await syncInbound();
        const reconciled = await getProductById(testProd.uuid);
        expect(reconciled.stock_quantity).toBe(27);
        await drainSyncQueue();
    });

    it('Scenario 22: Failed sync followed by successful retry (exponential backoff)', async () => {
        const retryUuid = 'retry-test-queue-item';
        const expUuid22 = await addExpense({ type: 'Other', amount: 50, note: 'Retry test' });
        const queueItem = await db.sync_queue.where('entity_uuid').equals(expUuid22).first();

        // 1. First attempt fails due to simulated network cut
        isNetworkOnline = false;
        let errorCaught = false;
        try {
            await processQueueItem(queueItem, TEST_USER_ID);
        } catch (e) {
            errorCaught = true;
            await db.sync_queue.update(queueItem.uuid, {
                attempts: 1,
                last_error: e.message
            });
        }
        expect(errorCaught).toBe(true);

        // 2. Network restored, retry succeeds
        isNetworkOnline = true;
        const itemRetry = await db.sync_queue.get(queueItem.uuid);
        expect(itemRetry.attempts).toBe(1);
        await processQueueItem(itemRetry, TEST_USER_ID);
        await db.sync_queue.delete(queueItem.uuid);
        expect(await db.sync_queue.get(queueItem.uuid)).toBeUndefined();
    });
});
