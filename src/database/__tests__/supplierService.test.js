import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    addSupplier,
    getAllSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier,
    searchSuppliers,
    getSupplierStats
} from '../supplierService';
import { supabase, getCurrentUserId } from '../supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn()
    },
    getCurrentUserId: vi.fn().mockResolvedValue('test-user-id')
}));

describe('supplierService.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('addSupplier', () => {
        it('should insert a supplier and return its ID', async () => {
            supabase.from.mockReturnValue(createQueryMock({ id: 'sup-1' }));

            const id = await addSupplier({
                name: ' Supplier Corp ',
                phone: '555-1234',
                address: '123 Main St',
                notes: 'Primary contact'
            });

            expect(getCurrentUserId).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledWith('suppliers');
            expect(supabase.from().insert).toHaveBeenCalledWith({
                user_id: 'test-user-id',
                name: 'Supplier Corp',
                phone: '555-1234',
                address: '123 Main St',
                notes: 'Primary contact'
            });
            expect(id).toBe('sup-1');
        });
    });

    describe('getAllSuppliers', () => {
        it('should fetch and return all suppliers ordered by name', async () => {
            const list = [{ name: 'A' }, { name: 'B' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await getAllSuppliers();

            expect(supabase.from).toHaveBeenCalledWith('suppliers');
            expect(supabase.from().order).toHaveBeenCalledWith('name');
            expect(res).toEqual(list);
        });
    });

    describe('getSupplierById', () => {
        it('should return a supplier by ID', async () => {
            const supplier = { id: 's1', name: 'Supplier' };
            supabase.from.mockReturnValue(createQueryMock(supplier));

            const res = await getSupplierById('s1');

            expect(supabase.from).toHaveBeenCalledWith('suppliers');
            expect(supabase.from().eq).toHaveBeenCalledWith('id', 's1');
            expect(res).toEqual(supplier);
        });
    });

    describe('updateSupplier', () => {
        it('should update supplier data and omit user_id', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            await updateSupplier('s1', {
                name: 'Updated Name',
                phone: '999',
                user_id: 'trying-to-change'
            });

            expect(supabase.from).toHaveBeenCalledWith('suppliers');
            expect(supabase.from().update).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Updated Name',
                    phone: '999'
                })
            );
            expect(supabase.from().update).not.toHaveBeenCalledWith(
                expect.objectContaining({ user_id: 'trying-to-change' })
            );
        });
    });

    describe('deleteSupplier', () => {
        it('should delete a supplier', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            await deleteSupplier('s1');

            expect(supabase.from).toHaveBeenCalledWith('suppliers');
            expect(supabase.from().delete).toHaveBeenCalled();
            expect(supabase.from().eq).toHaveBeenCalledWith('id', 's1');
        });
    });

    describe('searchSuppliers', () => {
        it('should search suppliers by name or phone case-insensitively', async () => {
            const list = [{ name: 'Sup' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await searchSuppliers('test');

            expect(supabase.from).toHaveBeenCalledWith('suppliers');
            expect(supabase.from().or).toHaveBeenCalledWith('name.ilike.%test%,phone.ilike.%test%');
            expect(res).toEqual(list);
        });
    });

    describe('getSupplierStats', () => {
        it('should calculate supplier statistics from purchase history', async () => {
            const purchases = [
                { id: 'p1', total_cost: 150, date: '2026-05-10T10:00:00Z' },
                { id: 'p2', total_cost: 300, date: '2026-05-20T10:00:00Z' }
            ];
            supabase.from.mockReturnValue(createQueryMock(purchases));

            const stats = await getSupplierStats('s1');

            expect(supabase.from).toHaveBeenCalledWith('purchases');
            expect(supabase.from().eq).toHaveBeenCalledWith('supplier_id', 's1');
            expect(stats).toEqual({
                totalPurchases: 2,
                totalSpend: 450,
                lastPurchaseDate: '2026-05-20T10:00:00Z'
            });
        });
    });
});
