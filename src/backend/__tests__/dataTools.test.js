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
    });
});
