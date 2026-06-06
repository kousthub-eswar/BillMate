export { initializeSettings, getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS } from './db';
export { supabase, getCurrentUserId } from './supabase';

export {
    getAllProducts, getProductById, addProduct, updateProduct,
    deleteProduct, searchProducts, getFrequentProducts, getLowStockProducts,
    adjustStock, getCategories, updateProductCategories
} from './productService';

export {
    createSale, getSaleById, getSales, refundSale, undoLastSale,
    getTodayStats, getTopSellingProducts, getDashboardStats
} from './salesService';

export {
    addExpense, getTodayExpenses, getExpensesByDate,
    deleteExpense, getTodayExpenseTotal, getExpenseTotal
} from './expenseService';

export {
    addCustomer, getAllCustomers, getCustomerById,
    updateCustomerBalance, getCustomerHistory, searchCustomers
} from './customerService';

export {
    addSupplier, getAllSuppliers, getSupplierById,
    updateSupplier, deleteSupplier, searchSuppliers, getSupplierStats
} from './supplierService';

export {
    createPurchase, getPurchases, getPurchaseById,
    getPurchasesBySupplier, deletePurchase, quickRestock, getPurchaseStats
} from './purchaseService';
