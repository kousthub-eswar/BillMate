import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAllData, importAllData } from '../dataTools';
import { supabase, getCurrentUserId } from '../../database/supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../../database/supabase', () => ({
    supabase: {
        from: vi.fn()
    },
    getCurrentUserId: vi.fn().mockResolvedValue('test-user-id')
}));

describe('dataTools.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        if (typeof window.URL.createObjectURL !== 'function') {
            window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        } else {
            vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-url');
        }
        
        if (typeof window.URL.revokeObjectURL !== 'function') {
            window.URL.revokeObjectURL = vi.fn();
        } else {
            vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
        }
    });

    describe('exportAllData', () => {
        it('should fetch data from all tables, create a blob and trigger download link click', async () => {
            const mockData = [{ id: 1, name: 'Item' }];
            const queryMock = createQueryMock(mockData);
            supabase.from.mockReturnValue(queryMock);

            const clickMock = vi.fn();
            const originalCreateElement = document.createElement;
            document.createElement = vi.fn((tagName) => {
                if (tagName === 'a') {
                    return {
                        href: '',
                        download: '',
                        click: clickMock
                    };
                }
                return originalCreateElement.call(document, tagName);
            });

            await exportAllData();

            expect(getCurrentUserId).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledTimes(9);
            expect(queryMock.eq).toHaveBeenCalledWith('user_id', 'test-user-id');
            expect(document.createElement).toHaveBeenCalledWith('a');
            expect(clickMock).toHaveBeenCalled();
            expect(window.URL.createObjectURL).toHaveBeenCalled();
            expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

            document.createElement = originalCreateElement;
        });
    });

    describe('importAllData', () => {
        const validBackup = JSON.stringify({
            version: 4,
            products: [{ id: 1, name: 'Product A' }],
            customers: [{ id: 2, name: 'Customer A' }],
            settings: [{ key: 'shop_name', value: 'Test' }]
        });

        it('should clear old data and insert imported data successfully', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            const result = await importAllData(validBackup);

            expect(getCurrentUserId).toHaveBeenCalled();
            expect(supabase.from().delete).toHaveBeenCalledTimes(9);
            expect(supabase.from().insert).toHaveBeenCalledTimes(3);
            expect(result).toEqual({ success: true, message: 'Data imported successfully' });
        });

        it('should return error message if backup format version is missing', async () => {
            const invalidBackup = JSON.stringify({
                products: [{ id: 1, name: 'Product A' }]
            });

            const result = await importAllData(invalidBackup);

            expect(result.success).toBe(false);
            expect(result.message).toContain('Invalid backup file format');
        });

        it('should return error message if parsing fails', async () => {
            const result = await importAllData('invalid-json');

            expect(result.success).toBe(false);
            expect(result.message).toContain('Unexpected token');
        });

        it('should remap foreign keys from old parent IDs to newly generated parent IDs', async () => {
            const backupWithRelationships = JSON.stringify({
                version: 4,
                customers: [{ id: 101, name: 'Alice' }],
                products: [{ id: 201, name: 'Bread' }],
                sales: [{ id: 301, customer_id: 101, total: 50 }],
                sale_items: [{ id: 401, sale_id: 301, product_id: 201, quantity: 1 }]
            });

            const insertedRows = {};
            supabase.from.mockImplementation((table) => {
                const queryMock = createQueryMock();
                queryMock.insert.mockImplementation((payload) => {
                    if (!insertedRows[table]) insertedRows[table] = [];
                    insertedRows[table].push(payload);
                    return queryMock;
                });
                queryMock.single.mockImplementation(() => {
                    if (table === 'customers') return Promise.resolve({ data: { id: 991 }, error: null });
                    if (table === 'products') return Promise.resolve({ data: { id: 992 }, error: null });
                    if (table === 'sales') return Promise.resolve({ data: { id: 993 }, error: null });
                    if (table === 'sale_items') return Promise.resolve({ data: { id: 994 }, error: null });
                    return Promise.resolve({ data: { id: 1 }, error: null });
                });
                return queryMock;
            });

            const result = await importAllData(backupWithRelationships);

            expect(result.success).toBe(true);
            expect(insertedRows.sales[0].customer_id).toBe(991);
            expect(insertedRows.sale_items[0].sale_id).toBe(993);
            expect(insertedRows.sale_items[0].product_id).toBe(992);
        });
    });
});
