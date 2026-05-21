import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createPurchase,
    getPurchases,
    getPurchaseById,
    getPurchasesBySupplier,
    deletePurchase,
    quickRestock,
    getPurchaseStats
} from '../purchaseService';
import { supabase } from '../supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn(),
        rpc: vi.fn()
    }
}));

describe('purchaseService.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createPurchase', () => {
        it('should call create_purchase RPC with mapped items and return results', async () => {
            supabase.rpc.mockResolvedValue({
                data: { purchaseId: 'p-123', totalCost: 250 },
                error: null
            });

            const items = [
                { product_id: 'prod-1', product_name: 'Item A', quantity: '5', purchase_price: '50.00' }
            ];

            const result = await createPurchase('sup-1', items, 'Some notes');

            expect(supabase.rpc).toHaveBeenCalledWith('create_purchase', {
                p_supplier_id: 'sup-1',
                p_items: [
                    { product_id: 'prod-1', product_name: 'Item A', quantity: 5, purchase_price: 50 }
                ],
                p_notes: 'Some notes'
            });
            expect(result).toEqual({ purchaseId: 'p-123', totalCost: 250 });
        });

        it('should throw an error if RPC fails', async () => {
            supabase.rpc.mockResolvedValue({
                data: null,
                error: new Error('RPC failed')
            });

            await expect(createPurchase('sup-1', [])).rejects.toThrow('RPC failed');
        });
    });

    describe('getPurchases', () => {
        it('should fetch purchases with filters', async () => {
            const list = [{ id: '1', total_cost: 10 }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const resDefault = await getPurchases('all');
            expect(supabase.from).toHaveBeenCalledWith('purchases');
            expect(resDefault).toEqual(list);

            await getPurchases('today');
            expect(supabase.from().gte).toHaveBeenCalled();
        });
    });

    describe('getPurchaseById', () => {
        it('should fetch purchase and its items', async () => {
            const purchase = { id: 'p-1', total_cost: 100 };
            const items = [{ id: 'item-1', purchase_id: 'p-1', quantity: 2 }];

            const purchasesMock = createQueryMock(purchase);
            const purchaseItemsMock = createQueryMock(items);
            supabase.from.mockImplementation((table) => {
                if (table === 'purchases') return purchasesMock;
                if (table === 'purchase_items') return purchaseItemsMock;
                return createQueryMock();
            });

            const result = await getPurchaseById('p-1');

            expect(supabase.from).toHaveBeenCalledWith('purchases');
            expect(purchasesMock.eq).toHaveBeenCalledWith('id', 'p-1');
            expect(supabase.from).toHaveBeenCalledWith('purchase_items');
            expect(purchaseItemsMock.eq).toHaveBeenCalledWith('purchase_id', 'p-1');
            expect(result).toEqual({ ...purchase, items });
        });
    });

    describe('getPurchasesBySupplier', () => {
        it('should fetch purchases filtered by supplier', async () => {
            const list = [{ id: 'p-1' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const result = await getPurchasesBySupplier('sup-1');

            expect(supabase.from).toHaveBeenCalledWith('purchases');
            expect(supabase.from().eq).toHaveBeenCalledWith('supplier_id', 'sup-1');
            expect(result).toEqual(list);
        });
    });

    describe('deletePurchase', () => {
        it('should call delete_purchase RPC', async () => {
            supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });

            const result = await deletePurchase('p-1');

            expect(supabase.rpc).toHaveBeenCalledWith('delete_purchase', { p_purchase_id: 'p-1' });
            expect(result).toEqual({ success: true });
        });
    });

    describe('quickRestock', () => {
        it('should call quick_restock RPC with correct parameters', async () => {
            supabase.rpc.mockResolvedValue({
                data: { purchaseId: 'p-restock', totalCost: 120 },
                error: null
            });

            const result = await quickRestock('prod-1', '10', '12.00', 'sup-1');

            expect(supabase.rpc).toHaveBeenCalledWith('quick_restock', {
                p_product_id: 'prod-1',
                p_quantity: 10,
                p_purchase_price: 12,
                p_supplier_id: 'sup-1'
            });
            expect(result).toEqual({ purchaseId: 'p-restock', totalCost: 120 });
        });
    });

    describe('getPurchaseStats', () => {
        it('should compute total purchase spend', async () => {
            const list = [{ total_cost: 100 }, { total_cost: 150 }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const stats = await getPurchaseStats();

            expect(stats).toEqual({
                totalPurchases: 2,
                totalSpend: 250
            });
        });
    });
});
