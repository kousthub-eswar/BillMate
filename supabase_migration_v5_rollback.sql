-- ==============================================================
-- BillMate POS — Migration Script v5 → v4 (Rollback Script)
-- WARNING: HIGH RISK OPERATION — DO NOT EXECUTE CASUALLY
-- ==============================================================
-- CRITICAL SAFETY ASSESSMENT:
-- 1. If v5 has been live and client devices have operated offline,
--    records in core tables (sales, purchases, products, customers)
--    rely on 'client_uuid' and 'idempotency_key'. Dropping these columns
--    will DESTROY client synchronization links and cause data loss.
-- 2. If 'inventory_movements' contains stock audit entries, dropping the
--    table will permanently erase the inventory audit trail.
-- 3. If rollback is necessary immediately after a failed migration
--    (before production traffic has written v5 data), this script safely
--    reverses RPC functions, policies, and indexes.
-- 4. In a production incident after v5 traffic has occurred, a
--    FORWARD-FIX or Point-In-Time-Recovery (PITR) restore is STRONGLY
--    RECOMMENDED over executing this rollback.
-- ==============================================================

-- STEP 1: Remove Stored Procedures (Safe to reverse)
DROP FUNCTION IF EXISTS sync_purchase_offline(text, text, jsonb, numeric, bigint, text, text, timestamptz);
DROP FUNCTION IF EXISTS sync_sale_offline(text, text, jsonb, text, bigint, text, numeric, timestamptz, text);

-- STEP 2: Drop Indexes created in v5
DROP INDEX IF EXISTS idx_sales_user_idempotency;
DROP INDEX IF EXISTS idx_sales_client_uuid;
DROP INDEX IF EXISTS idx_products_client_uuid;
DROP INDEX IF EXISTS idx_customers_client_uuid;
DROP INDEX IF EXISTS idx_suppliers_client_uuid;
DROP INDEX IF EXISTS idx_purchases_user_idempotency;
DROP INDEX IF EXISTS idx_purchases_client_uuid;
DROP INDEX IF EXISTS idx_inv_movements_user_uuid;
DROP INDEX IF EXISTS idx_inv_movements_user;
DROP INDEX IF EXISTS idx_inv_movements_prod;
DROP INDEX IF EXISTS idx_inv_movements_ref;

-- STEP 3: Drop Inventory Movements Table
-- WARNING: Unsafe if inventory movements have been logged by active users.
-- Uncomment ONLY if rolling back an unreleased staging or failed deployment:
-- DROP TABLE IF EXISTS inventory_movements CASCADE;

-- STEP 4: Remove Additive Columns
-- WARNING: DATA LOSS RISK. If offline transactions were recorded, dropping
-- these columns will permanently decouple client UUID references.
-- Uncomment ONLY during immediate post-migration abort:
-- ALTER TABLE sales DROP COLUMN IF EXISTS client_uuid;
-- ALTER TABLE sales DROP COLUMN IF EXISTS idempotency_key;
-- ALTER TABLE products DROP COLUMN IF EXISTS client_uuid;
-- ALTER TABLE customers DROP COLUMN IF EXISTS client_uuid;
-- ALTER TABLE suppliers DROP COLUMN IF EXISTS client_uuid;
-- ALTER TABLE purchases DROP COLUMN IF EXISTS client_uuid;
-- ALTER TABLE purchases DROP COLUMN IF EXISTS idempotency_key;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS client_uuid;

