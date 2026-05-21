import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    getSession,
    isAuthenticated,
    onAuthStateChange
} from '../auth';
import { supabase } from '../../database/supabase';

vi.mock('../../database/supabase', () => ({
    supabase: {
        auth: {
            signUp: vi.fn(),
            signInWithPassword: vi.fn(),
            signOut: vi.fn(),
            resetPasswordForEmail: vi.fn(),
            updateUser: vi.fn(),
            getSession: vi.fn(),
            getUser: vi.fn(),
            onAuthStateChange: vi.fn(),
        }
    }
}));

describe('auth.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe('signUp', () => {
        it('should call signUp on supabase auth and return data', async () => {
            const mockUser = { id: 'u1', email: 'test@example.com' };
            supabase.auth.signUp.mockResolvedValue({ data: mockUser, error: null });

            const data = await signUp('test@example.com', 'password123');

            expect(supabase.auth.signUp).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password123'
            });
            expect(data).toEqual(mockUser);
        });

        it('should throw error if signUp fails', async () => {
            supabase.auth.signUp.mockResolvedValue({ data: null, error: new Error('Signup failed') });
            await expect(signUp('test@example.com', 'p')).rejects.toThrow('Signup failed');
        });
    });

    describe('signIn', () => {
        it('should call signInWithPassword on supabase auth and return data', async () => {
            const mockSession = { session: { token: '123' } };
            supabase.auth.signInWithPassword.mockResolvedValue({ data: mockSession, error: null });

            const data = await signIn('test@example.com', 'password123');

            expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password123'
            });
            expect(data).toEqual(mockSession);
        });

        it('should throw error if signIn fails', async () => {
            supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: new Error('Login failed') });
            await expect(signIn('test@example.com', 'p')).rejects.toThrow('Login failed');
        });
    });

    describe('signOut', () => {
        it('should call signOut on supabase auth', async () => {
            supabase.auth.signOut.mockResolvedValue({ error: null });
            await signOut();
            expect(supabase.auth.signOut).toHaveBeenCalled();
        });

        it('should throw error if signOut fails', async () => {
            supabase.auth.signOut.mockResolvedValue({ error: new Error('Logout failed') });
            await expect(signOut()).rejects.toThrow('Logout failed');
        });
    });

    describe('resetPassword', () => {
        it('should call resetPasswordForEmail on supabase auth', async () => {
            supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

            const res = await resetPassword('test@example.com');

            expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
                'test@example.com',
                expect.objectContaining({ redirectTo: expect.any(String) })
            );
            expect(res).toEqual({});
        });
    });

    describe('updatePassword', () => {
        it('should call updateUser with new password', async () => {
            supabase.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });

            const res = await updatePassword('new-pass');

            expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-pass' });
            expect(res).toEqual({ user: {} });
        });
    });

    describe('getSession', () => {
        it('should return session from supabase auth', async () => {
            const mockSession = { token: '123' };
            supabase.auth.getSession.mockResolvedValue({ data: { session: mockSession } });

            const session = await getSession();

            expect(supabase.auth.getSession).toHaveBeenCalled();
            expect(session).toEqual(mockSession);
        });
    });

    describe('isAuthenticated', () => {
        it('should return false if there is no SB token in localStorage', () => {
            expect(isAuthenticated()).toBe(false);
        });

        it('should return true if SB token is present in localStorage', () => {
            localStorage.setItem('sb-custom-auth-token', 'my-auth-token-value');
            expect(isAuthenticated()).toBe(true);
        });
    });

    describe('onAuthStateChange', () => {
        it('should subscribe callback to auth state change', () => {
            const callback = () => {};
            onAuthStateChange(callback);
            expect(supabase.auth.onAuthStateChange).toHaveBeenCalledWith(callback);
        });
    });
});
