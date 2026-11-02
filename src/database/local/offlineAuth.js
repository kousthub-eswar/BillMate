import { db } from './db';
import { supabase } from '../supabase';

const SESSION_KEY = 'billmate_active_user_session';
const PIN_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;
const PBKDF2_ITERATIONS = 100000; // Work factor: 100,000 iterations of PBKDF2-HMAC-SHA256
const SESSION_MAX_INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Safe localStorage wrapper for browser and test environments
const safeStorage = {
    getItem: (k) => {
        try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
        } catch {
            return null;
        }
    },
    setItem: (k, v) => {
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
        } catch {}
    },
    removeItem: (k) => {
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(k);
        } catch {}
    }
};

// Helper: PBKDF2-HMAC-SHA256 key derivation using Web Crypto API
async function hashPin(pin, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pin),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: encoder.encode(salt),
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );
    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the currently active user ID.
 * Priority: Supabase active auth -> Cached localStorage session (validated) -> null
 */
export async function getActiveUserId() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            safeStorage.setItem(SESSION_KEY, JSON.stringify({
                userId: user.id,
                email: user.email,
                lastActive: Date.now(),
                locked: false
            }));
            return user.id;
        }
    } catch {
        // Network unavailable or offline
    }

    // Fallback to local session with strict validation & inactivity timeout
    const cached = safeStorage.getItem(SESSION_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (!parsed.userId) return null;
            if (parsed.locked) return null;

            // Inactivity check (24 hours)
            if (parsed.lastActive && (Date.now() - parsed.lastActive > SESSION_MAX_INACTIVITY_MS)) {
                safeStorage.setItem(SESSION_KEY, JSON.stringify({
                    userId: parsed.userId,
                    email: parsed.email,
                    locked: true,
                    expired: true
                }));
                return null;
            }

            return parsed.userId;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Enrolls a 4-to-8 digit PIN for offline workspace unlocking using PBKDF2.
 */
export async function enrollOfflinePin(userId, pin, email = '') {
    if (!userId) {
        throw new Error('User not authenticated');
    }
    if (!pin || pin.length < 4) {
        throw new Error('PIN must be at least 4 digits');
    }
    const salt = generateSalt();
    const pinHash = await hashPin(pin, salt);

    await db.user_pin_auth.put({
        user_id: userId,
        email: email || '',
        salt,
        pin_hash: pinHash,
        failed_attempts: 0,
        locked_until: 0,
        enrolled_at: new Date().toISOString()
    });

    return true;
}

/**
 * Verifies if user has enrolled an offline PIN.
 */
export async function hasEnrolledPin(userId) {
    if (!userId) return false;
    const record = await db.user_pin_auth.get(userId);
    return !!record;
}

/**
 * Returns metadata about the currently saved offline workspace, if any.
 */
export async function getOfflineWorkspaceInfo() {
    const cached = safeStorage.getItem(SESSION_KEY);
    let userId = null;
    let email = null;
    let locked = true;

    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            userId = parsed.userId || null;
            email = parsed.email || null;
            locked = !!parsed.locked;
        } catch {}
    }

    // If not in session key, check user_pin_auth table for enrolled user
    if (!userId) {
        const pinRecord = await db.user_pin_auth.toCollection().first();
        if (pinRecord) {
            userId = pinRecord.user_id;
            email = pinRecord.email || null;
            locked = true;
        }
    }

    if (!userId) return null;

    const hasPin = await hasEnrolledPin(userId);
    return {
        userId,
        email: email || 'Enrolled Merchant',
        locked,
        hasPin
    };
}

/**
 * Checks if workspace is currently unlocked offline with a valid PIN session.
 */
export function isWorkspaceUnlockedOffline() {
    const cached = safeStorage.getItem(SESSION_KEY);
    if (!cached) return false;
    try {
        const parsed = JSON.parse(cached);
        if (!parsed.userId || parsed.locked || !parsed.unlockedOffline) return false;
        if (parsed.lastActive && (Date.now() - parsed.lastActive > SESSION_MAX_INACTIVITY_MS)) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Validates the entered PIN offline with PBKDF2 and lockout protection.
 */
export async function verifyOfflinePin(userId, pin) {
    if (!userId) {
        throw new Error('User not authenticated');
    }
    const record = await db.user_pin_auth.get(userId);
    if (!record) {
        throw new Error('No offline PIN enrolled for this user.');
    }

    const now = Date.now();
    if (record.locked_until && record.locked_until > now) {
        const remainingMinutes = Math.ceil((record.locked_until - now) / 60000);
        throw new Error(`Too many failed attempts. Locked for ${remainingMinutes} more minute(s).`);
    }

    const computedHash = await hashPin(pin, record.salt);
    if (computedHash === record.pin_hash) {
        // Success: Reset failed attempts and restore active unlocked session
        await db.user_pin_auth.update(userId, {
            failed_attempts: 0,
            locked_until: 0
        });

        safeStorage.setItem(SESSION_KEY, JSON.stringify({
            userId,
            lastActive: Date.now(),
            unlockedOffline: true,
            locked: false
        }));
        return { success: true };
    } else {
        // Failed attempt: increment counter
        const newFailed = (record.failed_attempts || 0) + 1;
        let lockedUntil = 0;
        if (newFailed >= MAX_FAILED_ATTEMPTS) {
            lockedUntil = now + PIN_LOCK_DURATION_MS;
        }

        await db.user_pin_auth.update(userId, {
            failed_attempts: newFailed,
            locked_until: lockedUntil
        });

        if (lockedUntil > 0) {
            throw new Error(`Too many failed attempts. Account locked for 5 minutes.`);
        } else {
            const remaining = MAX_FAILED_ATTEMPTS - newFailed;
            throw new Error(`Incorrect PIN. ${remaining} attempt(s) remaining.`);
        }
    }
}

/**
 * Locks the workspace on logout without deleting pending sync records.
 */
export function lockWorkspace() {
    const cached = safeStorage.getItem(SESSION_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            safeStorage.setItem(SESSION_KEY, JSON.stringify({
                userId: parsed.userId,
                email: parsed.email,
                locked: true
            }));
        } catch {
            safeStorage.removeItem(SESSION_KEY);
        }
    }
}

/**
 * Checks if workspace is currently locked.
 */
export function isWorkspaceLocked() {
    const cached = safeStorage.getItem(SESSION_KEY);
    if (!cached) return true;
    try {
        const parsed = JSON.parse(cached);
        return !!parsed.locked;
    } catch {
        return true;
    }
}
