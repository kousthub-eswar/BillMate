import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createSale,
    getSaleById,
    getSales,
    refundSale,
    undoLastSale,
    getTodayStats,
    getTopSellingProducts,
    getDashboardStats
} from '../salesService';
import { supabase } from '../supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn(),
        rpc: vi.fn()
    }
}));

describe('salesService.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createSale', () => {
        it('should call create_sale RPC with cart mapped correctly', async () => {
            supabase.rpc.mockResolvedValue({
                data: { saleId: 'sale-1', total: 100, profit: 30 },
                error: null
            });

            const cart = [
                { id: 'p-1', name: 'Product A', quantity: 2, selling_price: 50, cost_price: 35 }
            ];

            const result = await createSale(cart, 'Cash', 'cust-1', { type: 'percent', value: 10 });

            expect(supabase.rpc).toHaveBeenCalledWith('create_sale', {
                p_cart: [
                    { id: 'p-1', name: 'Product A', quantity: 2, selling_price: 50, cost_price: 35 }
                ],
                p_payment_method: 'Cash',
                p_customer_id: 'cust-1',
                p_discount_type: 'percent',
                p_discount_value: 10
            });
            expect(result).toEqual({ saleId: 'sale-1', total: 100, profit: 30 });
        });
    });

    describe('getSaleById', () => {
        it('should fetch sale and its items', async () => {
            const sale = { id: 's-1', total: 200 };
            const items = [{ id: 'item-1', sale_id: 's-1', quantity: 2, subtotal: 200 }];

            const salesMock = createQueryMock(sale);
            const saleItemsMock = createQueryMock(items);
            supabase.from.mockImplementation((table) => {
                if (table === 'sales') return salesMock;
                if (table === 'sale_items') return saleItemsMock;
                return createQueryMock();
            });

            const result = await getSaleById('s-1');

            expect(supabase.from).toHaveBeenCalledWith('sales');
            expect(salesMock.eq).toHaveBeenCalledWith('id', 's-1');
            expect(supabase.from).toHaveBeenCalledWith('sale_items');
            expect(result).toEqual({ ...sale, items });
        });
    });

    describe('getSales', () => {
        it('should fetch non-settle sales with various filters', async () => {
            const list = [{ id: '1' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const resDefault = await getSales('today');
            expect(supabase.from).toHaveBeenCalledWith('sales');
            expect(supabase.from().neq).toHaveBeenCalledWith('payment_method', 'Settle');
            expect(resDefault).toEqual([{ id: '1', customer_name: null }]);

            await getSales('week');
            expect(supabase.from().gte).toHaveBeenCalled();

            const paginatedRes = await getSales('today', 2, 25);
            expect(supabase.from().range).toHaveBeenCalledWith(25, 49);
        });
    });

    describe('refundSale', () => {
        it('should call refund_sale RPC', async () => {
            supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });

            const result = await refundSale('s-1');

            expect(supabase.rpc).toHaveBeenCalledWith('refund_sale', { p_sale_id: 's-1' });
            expect(result).toEqual({ success: true });
        });
    });

    describe('undoLastSale', () => {
        it('should call undo_last_sale RPC', async () => {
            supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });

            const result = await undoLastSale();

            expect(supabase.rpc).toHaveBeenCalledWith('undo_last_sale');
            expect(result).toEqual({ success: true });
        });
    });

    describe('getTodayStats', () => {
        it('should compute today revenue and profit', async () => {
            const sales = [
                { total: 100, profit: 40 },
                { total: 150, profit: 50 }
            ];
            supabase.from.mockReturnValue(createQueryMock(sales));

            const stats = await getTodayStats();

            expect(stats).toEqual({
                totalRevenue: 250,
                totalProfit: 90,
                transactionCount: 2
            });
        });
    });

    describe('getTopSellingProducts', () => {
        it('should compute top selling products', async () => {
            const sales = [{ id: 's-1' }];
            const saleItems = [
                { product_name: 'Product A', quantity: 2 },
                { product_name: 'Product B', quantity: 5 }
            ];

            let callCount = 0;
            supabase.from.mockImplementation((table) => {
                callCount++;
                if (table === 'sales') {
                    return createQueryMock(sales);
                } else if (table === 'sale_items') {
                    return createQueryMock(saleItems);
                }
                return createQueryMock();
            });

            const top = await getTopSellingProducts(2);

            expect(top).toEqual([
                { name: 'Product B', quantity: 5 },
                { name: 'Product A', quantity: 2 }
            ]);
        });
    });

    describe('getDashboardStats', () => {
        it('should call get_dashboard_stats RPC and format outputs', async () => {
            const mockData = {
                total_revenue: 1500,
                total_profit: 600,
                transaction_count: 5,
                top_5_products: [
                    { name: 'Product A', quantity: 10 }
                ]
            };
            supabase.rpc.mockResolvedValue({ data: mockData, error: null });

            const result = await getDashboardStats('2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z');

            expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_stats', {
                p_start_date: '2026-05-01T00:00:00Z',
                p_end_date: '2026-05-31T23:59:59Z'
            });
            expect(result).toEqual({
                totalRevenue: 1500,
                totalProfit: 600,
                transactionCount: 5,
                topProducts: [{ name: 'Product A', quantity: 10 }]
            });
        });
    });
});
