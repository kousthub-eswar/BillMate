import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    addCustomer,
    getAllCustomers,
    getCustomerById,
    updateCustomerBalance,
    getCustomerHistory,
    searchCustomers
} from '../customerService';
import { supabase, getCurrentUserId } from '../supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn()
    },
    getCurrentUserId: vi.fn().mockResolvedValue('test-user-id')
}));

describe('customerService.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('addCustomer', () => {
        it('should insert a customer and return their ID', async () => {
            const mockCust = { id: 'cust-123', name: 'John Doe', phone: '1234567890' };
            supabase.from.mockReturnValue(createQueryMock(mockCust));

            const id = await addCustomer({ name: ' John Doe ', phone: '1234567890' });

            expect(getCurrentUserId).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledWith('customers');
            expect(supabase.from().insert).toHaveBeenCalledWith({
                user_id: 'test-user-id',
                name: 'John Doe',
                phone: '1234567890',
                balance: 0
            });
            expect(id).toBe('cust-123');
        });

        it('should throw an error if supabase insert fails', async () => {
            const dbError = new Error('Insert failed');
            supabase.from.mockReturnValue(createQueryMock(null, dbError));

            await expect(addCustomer({ name: 'Jane' })).rejects.toThrow('Insert failed');
        });
    });

    describe('getAllCustomers', () => {
        it('should fetch and return all customers ordered by name', async () => {
            const list = [{ name: 'A' }, { name: 'B' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await getAllCustomers();

            expect(supabase.from).toHaveBeenCalledWith('customers');
            expect(supabase.from().order).toHaveBeenCalledWith('name');
            expect(res).toEqual(list);
        });
    });

    describe('getCustomerById', () => {
        it('should return a customer by ID', async () => {
            const customer = { id: '1', name: 'Alice' };
            supabase.from.mockReturnValue(createQueryMock(customer));

            const res = await getCustomerById('1');

            expect(supabase.from).toHaveBeenCalledWith('customers');
            expect(supabase.from().eq).toHaveBeenCalledWith('id', '1');
            expect(res).toEqual(customer);
        });
    });

    describe('updateCustomerBalance', () => {
        it('should update balance and insert settlement record', async () => {
            const customer = { id: 'c1', name: 'Bob', balance: 100 };
            
            const customersQueryMock = createQueryMock(customer);
            const customersUpdateMock = createQueryMock({});
            const salesInsertMock = createQueryMock({});

            let customerCallCount = 0;
            supabase.from.mockImplementation((table) => {
                if (table === 'customers') {
                    customerCallCount++;
                    return customerCallCount === 1 ? customersQueryMock : customersUpdateMock;
                }
                if (table === 'sales') {
                    return salesInsertMock;
                }
                return createQueryMock();
            });

            await updateCustomerBalance('c1', 40);

            expect(supabase.from).toHaveBeenCalledWith('customers');
            expect(customersUpdateMock.update).toHaveBeenCalledWith(
                expect.objectContaining({ balance: 60 })
            );

            expect(supabase.from).toHaveBeenCalledWith('sales');
            expect(salesInsertMock.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    payment_method: 'Settle',
                    customer_id: 'c1',
                    settle_amount: 40,
                    total: 0
                })
            );
        });

        it('should not let balance drop below 0', async () => {
            const customer = { id: 'c1', name: 'Bob', balance: 10 };
            const customersQueryMock = createQueryMock(customer);
            const customersUpdateMock = createQueryMock({});
            const salesInsertMock = createQueryMock({});

            let customerCallCount = 0;
            supabase.from.mockImplementation((table) => {
                if (table === 'customers') {
                    customerCallCount++;
                    return customerCallCount === 1 ? customersQueryMock : customersUpdateMock;
                }
                if (table === 'sales') {
                    return salesInsertMock;
                }
                return createQueryMock();
            });

            await updateCustomerBalance('c1', 50);

            expect(customersUpdateMock.update).toHaveBeenCalledWith(
                expect.objectContaining({ balance: 0 })
            );
        });

        it('should throw an error if customer not found', async () => {
            supabase.from.mockReturnValue(createQueryMock(null));

            await expect(updateCustomerBalance('nonexistent', 50)).rejects.toThrow('Customer not found');
        });
    });

    describe('getCustomerHistory', () => {
        it('should return sales history ordered by date descending', async () => {
            const sales = [{ id: 's1', date: '2026-01-01' }];
            supabase.from.mockReturnValue(createQueryMock(sales));

            const res = await getCustomerHistory('c1');

            expect(supabase.from).toHaveBeenCalledWith('sales');
            expect(supabase.from().eq).toHaveBeenCalledWith('customer_id', 'c1');
            expect(supabase.from().order).toHaveBeenCalledWith('date', { ascending: false });
            expect(res).toEqual(sales);
        });
    });

    describe('searchCustomers', () => {
        it('should search by name or phone case-insensitively', async () => {
            const list = [{ name: 'Test' }];
            supabase.from.mockReturnValue(createQueryMock(list));

            const res = await searchCustomers('abc');

            expect(supabase.from).toHaveBeenCalledWith('customers');
            expect(supabase.from().or).toHaveBeenCalledWith('name.ilike.%abc%,phone.ilike.%abc%');
            expect(res).toEqual(list);
        });
    });
});
