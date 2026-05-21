import { vi } from 'vitest';

// A mock helper to build chainable query builder promises.
// By default, it resolves to { data: null, error: null }
export function createQueryMock(resolveData = null, resolveError = null) {
    const chain = {};
    
    const methods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
        'or', 'in', 'order', 'limit', 'single', 'maybeSingle',
        'range'
    ];

    methods.forEach(method => {
        chain[method] = vi.fn().mockImplementation(() => chain);
    });

    // Make it thenable so await works
    chain.then = vi.fn().mockImplementation((onFulfilled) => {
        return Promise.resolve({ data: resolveData, error: resolveError }).then(onFulfilled);
    });

    chain.catch = vi.fn().mockImplementation((onRejected) => {
        return Promise.resolve({ data: resolveData, error: resolveError }).catch(onRejected);
    });

    return chain;
}

export const mockSupabase = {
    auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        getSession: vi.fn(),
        getUser: vi.fn(),
        onAuthStateChange: vi.fn(),
    },
    from: vi.fn(() => createQueryMock()),
    rpc: vi.fn(),
};

export const mockGetCurrentUserId = vi.fn().mockResolvedValue('test-user-id');
