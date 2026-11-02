import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, generateUUID } from '../src/database/local/db';
import {
    enrollOfflinePin, hasEnrolledPin, verifyOfflinePin,
    lockWorkspace, isWorkspaceLocked, getOfflineWorkspaceInfo,
    isWorkspaceUnlockedOffline
} from '../src/database/local/offlineAuth';
import {
    addCustomer, getCustomerById, updateCustomerBalance
} from '../src/database/local/localCustomerRepo';
import { processQueueItem, drainSyncQueue } from '../src/services/syncEngine';
import { supabase } from '../src/database/supabase';
import fs from 'fs';

describe('BillMate Final Pre-Production Remediation Phase', () => {

    beforeEach(async () => {
        // Clear IndexedDB stores
        await db.user_pin_auth.clear();
        await db.customers.clear();
        await db.sales.clear();
        await db.sync_queue.clear();
        localStorage.clear();
        vi.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // SECTION 1: Supabase Environment Configuration & Hardcoding Removal
    // ------------------------------------------------------------------------
    describe('1. Environment Configuration & Absence of Hardcoded Fallbacks', () => {
        it('should not contain any hardcoded staging Supabase URL or anon key fallbacks in supabase.js', () => {
            const supabaseSource = fs.readFileSync('src/database/supabase.js', 'utf8');
            expect(supabaseSource).not.toContain("'https://txrktvlfrbtuerabpqpe.supabase.co'");
            expect(supabaseSource).not.toContain('"https://txrktvlfrbtuerabpqpe.supabase.co"');
            expect(supabaseSource).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(supabaseSource).toContain("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be defined");
        });

        it('.env.example must only contain safe placeholder values', () => {
            const example = fs.readFileSync('.env.example', 'utf8');
            expect(example).not.toContain('txrktvlfrbtuerabpqpe');
            expect(example).toContain('https://your-project.supabase.co');
            expect(example).toContain('your-supabase-anon-key-here');
        });

        it('.gitignore must explicitly exclude environment local files', () => {
            const gitignore = fs.readFileSync('.gitignore', 'utf8');
            expect(gitignore).toContain('.env.local');
            expect(gitignore).toContain('.env.staging.local');
            expect(gitignore).toContain('.env.production.local');
        });
    });

    // ------------------------------------------------------------------------
    // SECTION 2: Offline PIN UI & Authentication Engine
    // ------------------------------------------------------------------------
    describe('2. Offline PIN Security & UI Lifecycle', () => {
        const testUserId = 'test-merchant-user-1';
        const testEmail = 'merchant@billmate.app';

        it('should enroll a 4-8 digit offline PIN using PBKDF2 with salt', async () => {
            const enrolled = await enrollOfflinePin(testUserId, '1234', testEmail);
            expect(enrolled).toBe(true);

            const hasPin = await hasEnrolledPin(testUserId);
            expect(hasPin).toBe(true);

            const record = await db.user_pin_auth.get(testUserId);
            expect(record.salt).toBeDefined();
            expect(record.salt.length).toBe(32);
            expect(record.pin_hash).toBeDefined();
            expect(record.pin_hash).not.toBe('1234'); // Never store plaintext
            expect(record.email).toBe(testEmail);
        });

        it('should reject enrollment with PIN shorter than 4 digits', async () => {
            await expect(enrollOfflinePin(testUserId, '12')).rejects.toThrow('PIN must be at least 4 digits');
        });

        it('should retrieve offline workspace info for login screen display', async () => {
            await enrollOfflinePin(testUserId, '5678', testEmail);
            lockWorkspace();

            const info = await getOfflineWorkspaceInfo();
            expect(info).not.toBeNull();
            expect(info.userId).toBe(testUserId);
            expect(info.email).toBe(testEmail);
            expect(info.hasPin).toBe(true);
        });

        it('should verify valid PIN, unlock local workspace, and enable offline session', async () => {
            await enrollOfflinePin(testUserId, '4321', testEmail);
            lockWorkspace();

            const res = await verifyOfflinePin(testUserId, '4321');
            expect(res.success).toBe(true);
            expect(isWorkspaceUnlockedOffline()).toBe(true);
        });

        it('should track failed attempts and enforce lockout after 5 consecutive failures', async () => {
            await enrollOfflinePin(testUserId, '9999', testEmail);

            // Attempts 1 to 4 should report remaining attempts
            for (let i = 1; i <= 4; i++) {
                await expect(verifyOfflinePin(testUserId, '0000')).rejects.toThrow(
                    `Incorrect PIN. ${5 - i} attempt(s) remaining.`
                );
            }

            // 5th attempt locks out
            await expect(verifyOfflinePin(testUserId, '0000')).rejects.toThrow(
                'Too many failed attempts. Account locked for 5 minutes.'
            );

            // Even correct PIN is rejected during lockout window
            await expect(verifyOfflinePin(testUserId, '9999')).rejects.toThrow(
                'Too many failed attempts. Locked for 5 more minute(s).'
            );
        });

        it('should prevent cross-user offline workspace unlocking', async () => {
            const userA = 'user-a-111';
            const userB = 'user-b-222';
            await enrollOfflinePin(userA, '1111', 'usera@billmate.app');
            await enrollOfflinePin(userB, '2222', 'userb@billmate.app');

            // User A PIN cannot unlock User B workspace
            await expect(verifyOfflinePin(userB, '1111')).rejects.toThrow();

            // Correct User B PIN unlocks User B only
            const res = await verifyOfflinePin(userB, '2222');
            expect(res.success).toBe(true);

            // Workspace info reflects User B
            const session = JSON.parse(localStorage.getItem('billmate_active_user_session'));
            expect(session.userId).toBe(userB);
        });

        it('should preserve pending outbox transactions and prevent cloud writes when unauthenticated to Supabase', async () => {
            // Simulate user unlocked offline with PIN (no Supabase session)
            vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
                data: { session: null },
                error: null
            });

            // Queue a transaction
            const queueItem = {
                uuid: generateUUID(),
                entity: 'sales',
                action: 'CREATE',
                status: 'PENDING',
                created_at: new Date().toISOString()
            };
            await db.sync_queue.put(queueItem);

            const rpcSpy = vi.spyOn(supabase, 'rpc');

            // Attempt drainSyncQueue while offline unlocked
            await drainSyncQueue();

            // Cloud RPC must NOT have been called
            expect(rpcSpy).not.toHaveBeenCalled();

            // Queue item must be preserved intact as PENDING
            const preserved = await db.sync_queue.get(queueItem.uuid);
            expect(preserved.status).toBe('PENDING');
        });
    });

    // ------------------------------------------------------------------------
    // SECTION 3: Fix Offline Customer Settlement Edge Case
    // ------------------------------------------------------------------------
    describe('3. Offline Customer Settlement & UUID Resolution', () => {
        const userId = 'settle-user-123';

        beforeEach(() => {
            localStorage.setItem('billmate_active_user_session', JSON.stringify({
                userId,
                email: 'test@billmate.app',
                locked: false
            }));
            vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
                data: { user: { id: userId, email: 'test@billmate.app' } },
                error: null
            });
            vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
                data: { session: { user: { id: userId } } },
                error: null
            });
        });

        it('should handle full lifecycle: customer created offline -> credit sale offline -> settlement offline -> sync', async () => {
            // 1. Customer created offline (has uuid, but NO cloud id yet)
            const custUuid = await addCustomer({
                name: 'Offline Customer',
                phone: '9876543210',
                balance: 100 // starting balance from offline credit sale
            });

            const custBeforeSettle = await getCustomerById(custUuid);
            expect(custBeforeSettle.id).toBeUndefined();
            expect(custBeforeSettle.balance).toBe(100);

            // 2. Customer pays 60 offline (settlement)
            await updateCustomerBalance(custUuid, 60);

            const custAfterSettle = await getCustomerById(custUuid);
            expect(custAfterSettle.balance).toBe(40); // 100 - 60 = 40

            // Verify queue has UPDATE_BALANCE item with idempotency_key
            const queueItems = await db.sync_queue.toArray();
            const settleItem = queueItems.find(q => q.action === 'UPDATE_BALANCE');
            expect(settleItem).toBeDefined();
            expect(settleItem.idempotency_key).toBeDefined();
            expect(settleItem.idempotency_key).toContain('settle_');

            // 3. Mock Supabase cloud responses for sync
            const cloudCustomerId = 42;
            let cloudCustomerBalance = 100;
            const cloudSales = [];

            // Mock customer lookup by client_uuid
            vi.spyOn(supabase, 'from').mockImplementation((table) => {
                if (table === 'customers') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: { id: cloudCustomerId }
                                    })
                                })
                            })
                        }),
                        update: vi.fn().mockImplementation((payload) => ({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockImplementation(() => {
                                    cloudCustomerBalance = payload.balance;
                                    return Promise.resolve({ error: null });
                                })
                            })
                        }))
                    };
                }
                if (table === 'sales') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: null // No duplicate on first sync
                                    })
                                })
                            })
                        }),
                        insert: vi.fn().mockImplementation((payload) => {
                            cloudSales.push(payload);
                            return Promise.resolve({ error: null });
                        })
                    };
                }
                return {};
            });

            // 4. Process customer settlement queue item
            await processQueueItem(settleItem, userId);

            // Cloud balance should now reflect 40
            expect(cloudCustomerBalance).toBe(40);

            // Settle sales record should have been inserted into cloud sales
            expect(cloudSales.length).toBe(1);
            expect(cloudSales[0].payment_method).toBe('Settle');
            expect(cloudSales[0].customer_id).toBe(cloudCustomerId);
            expect(cloudSales[0].settle_amount).toBe(60);
            expect(cloudSales[0].idempotency_key).toBe(settleItem.idempotency_key);
        });

        it('should prevent duplicate balance adjustments upon retry with same idempotency key', async () => {
            const custUuid = generateUUID();
            await db.customers.put({
                uuid: custUuid,
                user_id: userId,
                name: 'Retry Customer',
                balance: 50,
                id: 99
            });

            const settleItem = {
                uuid: generateUUID(),
                entity: 'customers',
                action: 'UPDATE_BALANCE',
                entity_uuid: custUuid,
                idempotency_key: 'settle_retry_key_001',
                payload: {
                    customer_uuid: custUuid,
                    customer_id: 99,
                    settle_amount: 50,
                    new_balance: 0,
                    user_id: userId
                }
            };

            let updateCalls = 0;
            let insertCalls = 0;

            // Mock Supabase returning existing settlement (simulating retry after lost ACK)
            vi.spyOn(supabase, 'from').mockImplementation((table) => {
                if (table === 'sales') {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                eq: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: { id: 888 } // ALREADY EXISTS in cloud
                                    })
                                })
                            })
                        }),
                        insert: vi.fn().mockImplementation(() => {
                            insertCalls++;
                            return Promise.resolve({ error: null });
                        })
                    };
                }
                if (table === 'customers') {
                    return {
                        update: vi.fn().mockImplementation(() => {
                            updateCalls++;
                            return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
                        })
                    };
                }
                return {};
            });

            // Process retry item
            await processQueueItem(settleItem, userId);

            // Because existingSettle was found, NO customer update or sale insert must happen
            expect(updateCalls).toBe(0);
            expect(insertCalls).toBe(0);

            // Local customer must be marked SYNCED
            const localCust = await db.customers.get(custUuid);
            expect(localCust.sync_status).toBe('SYNCED');
        });
    });

    // ------------------------------------------------------------------------
    // SECTION 4: Database Backup and Recovery Documentation Consistency
    // ------------------------------------------------------------------------
    describe('4. Recovery Documentation & Rollback Script Checks', () => {
        it('supabase_migration_v5_rollback.sql must exist and warn against destructive column drops with active traffic', () => {
            expect(fs.existsSync('supabase_migration_v5_rollback.sql')).toBe(true);
            const rollbackSql = fs.readFileSync('supabase_migration_v5_rollback.sql', 'utf8');
            expect(rollbackSql).toContain('WARNING: HIGH RISK OPERATION');
            expect(rollbackSql).toContain('DROP FUNCTION IF EXISTS sync_sale_offline');
            expect(rollbackSql).toContain('DROP FUNCTION IF EXISTS sync_purchase_offline');
            expect(rollbackSql).toContain('FORWARD-FIX');
        });

        it('DATABASE_BACKUP_AND_RECOVERY_PLAN.md must document PITR, failure triggers, and forward-fix strategy', () => {
            expect(fs.existsSync('DATABASE_BACKUP_AND_RECOVERY_PLAN.md')).toBe(true);
            const doc = fs.readFileSync('DATABASE_BACKUP_AND_RECOVERY_PLAN.md', 'utf8');
            expect(doc).toContain('pg_dump');
            expect(doc).toContain('PITR');
            expect(doc).toContain('Forward-Fix Strategy');
            expect(doc).toContain('Conditions Under Which Rollback is UNSAFE');
        });
    });
});
