import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getAllProducts,
    getProductById,
    addProduct,
    updateProduct,
    deleteProduct,
    searchProducts,
    getFrequentProducts,
    getLowStockProducts,
    adjustStock,
    getCategories,
    updateProductCategories
} from '../productService';
import { supabase, getCurrentUserId } from '../supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn()
    },
    getCurrentUserId: vi.fn().mockResolvedValue('test-user-id')
}));

describe('productService.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getAllProducts', () => {
        it('should fetch and return all products ordered by name', async () => {
            const list = [{ name: 'A' }, { name: 'B' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await getAllProducts();

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().order).toHaveBeenCalledWith('name');
            expect(res).toEqual(list);
        });
    });

    describe('getProductById', () => {
        it('should return a product by ID', async () => {
            const prod = { id: 'p1', name: 'Product 1' };
            supabase.from.mockReturnValue(createQueryMock(prod));

            const res = await getProductById('p1');

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().eq).toHaveBeenCalledWith('id', 'p1');
            expect(res).toEqual(prod);
        });
    });

    describe('addProduct', () => {
        it('should insert product and return ID', async () => {
            supabase.from.mockReturnValue(createQueryMock({ id: 'p-new' }));

            const id = await addProduct({
                name: ' Milk ',
                selling_price: '25.50',
                cost_price: '20',
                stock_quantity: '10',
                category: 'Dairy',
                frequently_used: true,
                barcode: '12345'
            });

            expect(getCurrentUserId).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().insert).toHaveBeenCalledWith({
                user_id: 'test-user-id',
                name: 'Milk',
                selling_price: 25.50,
                cost_price: 20,
                stock_quantity: 10,
                category: 'Dairy',
                frequently_used: 1,
                barcode: '12345'
            });
            expect(id).toBe('p-new');
        });
    });

    describe('updateProduct', () => {
        it('should update product columns and parse numeric fields', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            await updateProduct('p1', {
                selling_price: '30.00',
                cost_price: '22.50',
                stock_quantity: '5',
                frequently_used: false,
                name: 'Updated Name',
                user_id: 'malicious-attempt'
            });

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().update).toHaveBeenCalledWith(
                expect.objectContaining({
                    selling_price: 30,
                    cost_price: 22.5,
                    stock_quantity: 5,
                    frequently_used: 0,
                    name: 'Updated Name'
                })
            );
            expect(supabase.from().update).not.toHaveBeenCalledWith(
                expect.objectContaining({ user_id: 'malicious-attempt' })
            );
        });
    });

    describe('deleteProduct', () => {
        it('should delete product by ID', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            await deleteProduct('p1');

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().delete).toHaveBeenCalled();
            expect(supabase.from().eq).toHaveBeenCalledWith('id', 'p1');
        });
    });

    describe('searchProducts', () => {
        it('should search products by name, barcode or category case-insensitively', async () => {
            const list = [{ name: 'Search Result' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await searchProducts('query');

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().or).toHaveBeenCalledWith('name.ilike.%query%,barcode.ilike.%query%,category.ilike.%query%');
            expect(res).toEqual(list);
        });
    });

    describe('getFrequentProducts', () => {
        it('should fetch products with frequently_used = 1', async () => {
            const list = [{ name: 'Bread' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await getFrequentProducts();

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().eq).toHaveBeenCalledWith('frequently_used', 1);
            expect(res).toEqual(list);
        });
    });

    describe('getLowStockProducts', () => {
        it('should fetch products under low stock threshold', async () => {
            const list = [{ name: 'Milk', stock_quantity: 2 }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await getLowStockProducts(4);

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().lte).toHaveBeenCalledWith('stock_quantity', 4);
            expect(supabase.from().order).toHaveBeenCalledWith('stock_quantity');
            expect(res).toEqual(list);
        });
    });

    describe('adjustStock', () => {
        it('should adjust stock by a positive or negative amount', async () => {
            const product = { id: 'p1', stock_quantity: 10 };
            const getProductMock = createQueryMock(product);
            const updateProductMock = createQueryMock({});
            let callCount = 0;
            supabase.from.mockImplementation((table) => {
                callCount++;
                return callCount === 1 ? getProductMock : updateProductMock;
            });

            await adjustStock('p1', 5);

            expect(updateProductMock.update).toHaveBeenCalledWith(
                expect.objectContaining({ stock_quantity: 15 })
            );
        });
    });

    describe('getCategories', () => {
        it('should fetch products and return a list of unique categories', async () => {
            const data = [
                { category: 'Dairy' },
                { category: 'Bakery' },
                { category: 'Dairy' }
            ];
            supabase.from.mockReturnValue(createQueryMock(data));

            const res = await getCategories();

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().select).toHaveBeenCalledWith('category');
            expect(res).toEqual(['Dairy', 'Bakery']);
        });
    });

    describe('updateProductCategories', () => {
        it('should update categories of products matching old category', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            await updateProductCategories('Dairy', 'Milky');

            expect(supabase.from).toHaveBeenCalledWith('products');
            expect(supabase.from().update).toHaveBeenCalledWith(
                expect.objectContaining({ category: 'Milky' })
            );
            expect(supabase.from().eq).toHaveBeenCalledWith('category', 'Dairy');
        });
    });
});
