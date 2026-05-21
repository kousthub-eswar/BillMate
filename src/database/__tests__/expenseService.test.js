import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    addExpense,
    getTodayExpenses,
    getExpensesByDate,
    deleteExpense,
    getTodayExpenseTotal
} from '../expenseService';
import { supabase, getCurrentUserId } from '../supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn()
    },
    getCurrentUserId: vi.fn().mockResolvedValue('test-user-id')
}));

describe('expenseService.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('addExpense', () => {
        it('should insert an expense and return its ID', async () => {
            const mockExp = { id: 'exp-1', type: 'Rent', amount: 500, date: '2026-05-21', note: 'Office rent' };
            supabase.from.mockReturnValue(createQueryMock(mockExp));

            const id = await addExpense({ type: 'Rent', amount: '500.50', note: 'Office rent' });

            expect(getCurrentUserId).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledWith('expenses');
            expect(supabase.from().insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: 'test-user-id',
                    type: 'Rent',
                    amount: 500.50,
                    note: 'Office rent'
                })
            );
            expect(id).toBe('exp-1');
        });

        it('should throw an error if supabase fails', async () => {
            const dbError = new Error('Database Error');
            supabase.from.mockReturnValue(createQueryMock(null, dbError));

            await expect(addExpense({ type: 'General', amount: 10 })).rejects.toThrow('Database Error');
        });
    });

    describe('getTodayExpenses', () => {
        it('should fetch expenses for today ordered by date descending', async () => {
            const list = [{ id: '1', amount: 100 }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await getTodayExpenses();

            expect(supabase.from).toHaveBeenCalledWith('expenses');
            expect(supabase.from().gte).toHaveBeenCalledWith('date', expect.any(String));
            expect(supabase.from().order).toHaveBeenCalledWith('date', { ascending: false });
            expect(res).toEqual(list);
        });
    });

    describe('getExpensesByDate', () => {
        it('should fetch expenses in a date range', async () => {
            const list = [{ id: '2', amount: 200 }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await getExpensesByDate('2026-05-01', '2026-05-15');

            expect(supabase.from).toHaveBeenCalledWith('expenses');
            expect(supabase.from().gte).toHaveBeenCalledWith('date', expect.stringContaining('2026-05-01'));
            expect(supabase.from().lte).toHaveBeenCalledWith('date', expect.stringContaining('2026-05-15'));
            expect(res).toEqual(list);
        });
    });

    describe('deleteExpense', () => {
        it('should delete expense by ID', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            await deleteExpense('exp-99');

            expect(supabase.from).toHaveBeenCalledWith('expenses');
            expect(supabase.from().delete).toHaveBeenCalled();
            expect(supabase.from().eq).toHaveBeenCalledWith('id', 'exp-99');
        });
    });

    describe('getTodayExpenseTotal', () => {
        it('should return total sum of today expenses', async () => {
            const list = [{ amount: 10.5 }, { amount: 20 }, { amount: 5.5 }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const total = await getTodayExpenseTotal();

            expect(total).toBe(36);
        });
    });
});
