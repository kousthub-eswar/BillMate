// Offline-First Database Layer with Dexie.js & Supabase Cloud Sync
export { db, generateUUID } from './local/db';
export {
    getActiveUserId, enrollOfflinePin, hasEnrolledPin,
    verifyOfflinePin, lockWorkspace, isWorkspaceLocked,
    getOfflineWorkspaceInfo, isWorkspaceUnlockedOffline
} from './local/offlineAuth';

export {
    initializeSettings, getSetting, setSetting,
    getAllSettings, DEFAULT_SETTINGS
} from './local/localSettingsRepo';

export { supabase, getCurrentUserId } from './supabase';

export {
    getAllProducts, getProductById, addProduct, updateProduct,
    deleteProduct, searchProducts, getFrequentProducts, getLowStockProducts,
    adjustStock, getCategories, updateProductCategories
} from './local/localProductRepo';

export {
    createSale, getSaleById, getSales, refundSale, undoLastSale,
    getTodayStats, getTopSellingProducts, getDashboardStats
} from './local/localSaleRepo';

export {
    addExpense, getTodayExpenses, getExpensesByDate,
    deleteExpense, getTodayExpenseTotal, getExpenseTotal
} from './local/localExpenseRepo';

export {
    addCustomer, getAllCustomers, getCustomerById,
    updateCustomerBalance, getCustomerHistory, searchCustomers
} from './local/localCustomerRepo';

export {
    addSupplier, getAllSuppliers, getSupplierById,
    updateSupplier, deleteSupplier, searchSuppliers, getSupplierStats
} from './local/localSupplierRepo';

export {
    createPurchase, getPurchases, getPurchaseById,
    getPurchasesBySupplier, deletePurchase, quickRestock, getPurchaseStats
} from './local/localPurchaseRepo';

export {
    startSyncEngine, drainSyncQueue, syncInbound,
    broadcastSyncStatus, getPendingCount
} from '../services/syncEngine';
