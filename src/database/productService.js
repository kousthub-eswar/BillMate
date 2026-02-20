import { db } from './db';

export async function getAllProducts() {
    return await db.products.toArray();
}

export async function getProductById(id) {
    return await db.products.get(id);
}

export async function addProduct(product) {
    return await db.products.add({
        name: product.name,
        selling_price: parseFloat(product.selling_price),
        cost_price: parseFloat(product.cost_price),
        stock_quantity: parseInt(product.stock_quantity),
        category: product.category || 'General',
        frequently_used: product.frequently_used || false,
        barcode: product.barcode || ''
    });
}

export async function updateProduct(id, updates) {
    return await db.products.update(id, updates);
}

export async function deleteProduct(id) {
    return await db.products.delete(id);
}

export async function searchProducts(query) {
    const lowerQuery = query.toLowerCase();
    return await db.products
        .filter(p =>
            p.name.toLowerCase().includes(lowerQuery) ||
            (p.barcode && p.barcode.includes(query))
        )
        .toArray();
}

export async function getFrequentProducts() {
    return await db.products
        .where('frequently_used')
        .equals(1)
        .toArray();
}

export async function getLowStockProducts(threshold) {
    return await db.products
        .filter(p => p.stock_quantity <= threshold)
        .toArray();
}

export async function adjustStock(id, adjustment) {
    const product = await db.products.get(id);
    if (product) {
        const newQty = Math.max(0, product.stock_quantity + adjustment);
        await db.products.update(id, { stock_quantity: newQty });
        return newQty;
    }
    return null;
}

export async function getCategories() {
    const products = await db.products.toArray();
    const categories = [...new Set(products.map(p => p.category))];
    return categories.filter(Boolean);
}
