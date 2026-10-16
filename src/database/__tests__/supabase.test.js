import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase, getCurrentUserId } from '../supabase';

describe('supabase.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return user ID when authenticated', async () => {
        vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
            data: { user: { id: 'auth-user-789' } },
            error: null
        });

        const userId = await getCurrentUserId();
        expect(userId).toBe('auth-user-789');
    });

    it('should throw Not authenticated when no user is returned', async () => {
        vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
            data: { user: null },
            error: null
        });

        await expect(getCurrentUserId()).rejects.toThrow('Not authenticated');
    });
});
