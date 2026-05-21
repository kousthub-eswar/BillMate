import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeSettings, getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS } from '../db';
import { supabase, getCurrentUserId } from '../supabase';
import { createQueryMock } from '../../test/supabaseMock';

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn()
    },
    getCurrentUserId: vi.fn().mockResolvedValue('test-user-id')
}));

describe('db.js (Settings Service)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initializeSettings', () => {
        it('should upsert default settings if they do not exist', async () => {
            supabase.from.mockReturnValue(createQueryMock(null));

            await initializeSettings();

            expect(getCurrentUserId).toHaveBeenCalled();
            expect(supabase.from).toHaveBeenCalledWith('settings');
            expect(supabase.from().select).toHaveBeenCalledWith('key');
            expect(supabase.from().upsert).toHaveBeenCalledTimes(Object.keys(DEFAULT_SETTINGS).length);
        });

        it('should not upsert if settings already exist', async () => {
            supabase.from.mockReturnValue(createQueryMock({ key: 'shop_name' }));

            await initializeSettings();

            expect(supabase.from().upsert).not.toHaveBeenCalled();
        });
    });

    describe('getSetting', () => {
        it('should return value from database if key exists', async () => {
            supabase.from.mockReturnValue(createQueryMock({ value: 'Test Custom Shop' }));

            const val = await getSetting('shop_name');
            expect(val).toBe('Test Custom Shop');
            expect(supabase.from().select).toHaveBeenCalledWith('value');
        });

        it('should return default setting if key does not exist in DB but exists in default settings', async () => {
            supabase.from.mockReturnValue(createQueryMock(null));

            const val = await getSetting('shop_name');
            expect(val).toBe(String(DEFAULT_SETTINGS.shop_name));
        });
    });

    describe('setSetting', () => {
        it('should upsert setting into DB', async () => {
            supabase.from.mockReturnValue(createQueryMock({}));

            await setSetting('custom_key', 'custom_value');

            expect(supabase.from().upsert).toHaveBeenCalledWith({
                key: 'custom_key',
                value: 'custom_value',
                user_id: 'test-user-id'
            });
        });
    });

    describe('getAllSettings', () => {
        it('should return merged settings with defaults and database values', async () => {
            const dbSettings = [
                { key: 'shop_name', value: 'Overridden Shop Name' },
                { key: 'custom_key', value: 'custom_value' }
            ];
            supabase.from.mockReturnValue(createQueryMock(dbSettings));

            const allSettings = await getAllSettings();

            expect(allSettings.shop_name).toBe('Overridden Shop Name');
            expect(allSettings.currency).toBe(String(DEFAULT_SETTINGS.currency));
            expect(allSettings.custom_key).toBe('custom_value');
        });
    });
});
