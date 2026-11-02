# BillMate — Production Database Backup, Migration & Recovery Plan

This document establishes the operational procedure for executing, validating, and (if necessary) recovering from database migrations on the BillMate Supabase PostgreSQL infrastructure.

---

## 1. Pre-Migration Backup Requirements

Before executing `supabase_migration_v5_offline.sql` on the production Supabase database:
1. **Manual Logical Backup (pg_dump)**:
   Extract a complete SQL dump of the production database using standard PostgreSQL utilities:
   ```bash
   pg_dump "postgres://postgres:[DB-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
     --clean --if-exists --quote-all-identifiers \
     --file="billmate_prod_pre_v5_backup_$(date +%Y%m%d_%H%M%S).sql"
   ```
2. **Schema-Only Dump**:
   ```bash
   pg_dump "postgres://postgres:[DB-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
     --schema-only \
     --file="billmate_prod_schema_pre_v5.sql"
   ```
3. Store the backup files in encrypted offsite storage (e.g., S3 Glacier / Cloud Storage).

---

## 2. Supabase Backup & PITR Verification

Verify that backup protection is active in the Supabase Dashboard:
1. Navigate to **Project Settings** $\to$ **Database** $\to$ **Backups**.
2. Confirm that daily automated backups are enabled and show `Healthy`.
3. If Point-in-Time Recovery (PITR) is provisioned (Pro/Team tier), verify the retention window (e.g., 7 days) and note the exact timestamp before running migration V5.

---

## 3. Existing Schema Snapshot

The baseline pre-V5 schema includes:
- `products`: `id`, `user_id`, `name`, `selling_price`, `cost_price`, `stock_quantity`, `category`, `barcode`
- `customers`: `id`, `user_id`, `name`, `phone`, `balance`
- `suppliers`: `id`, `user_id`, `name`, `phone`, `address`, `notes`
- `sales`: `id`, `user_id`, `date`, `total`, `subtotal`, `discount_amount`, `payment_method`, `refunded`, `customer_id`
- `sale_items`: `id`, `user_id`, `sale_id`, `product_id`, `product_name`, `quantity`, `selling_price`, `cost_price`
- `purchases`: `id`, `user_id`, `supplier_id`, `date`, `total_cost`, `notes`
- `purchase_items`: `id`, `user_id`, `purchase_id`, `product_id`, `product_name`, `quantity`, `purchase_price`
- `expenses`: `id`, `user_id`, `type`, `amount`, `date`, `note`

---

## 4. Migration Execution Order

1. **Step 1**: Place web frontend in scheduled maintenance or deploy bundle with offline queue retention.
2. **Step 2**: Open Supabase SQL Editor in the production project.
3. **Step 3**: Execute `supabase_migration_v5_offline.sql`.
   - The script is structured in atomic blocks:
     - 1. Additive columns and partial unique indexes (`client_uuid`, `idempotency_key`).
     - 2. Creation of `inventory_movements` ledger table, unique index, and RLS policies.
     - 3. Creation of atomic stored procedure `sync_sale_offline` with security definer and `auth.uid()` checks.
     - 4. Creation of atomic stored procedure `sync_purchase_offline` with security definer and `auth.uid()` checks.

---

## 5. Post-Migration Validation Checklist

Execute these verification queries immediately in the SQL Editor:
```sql
-- 1. Check all columns exist
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('sales', 'purchases', 'products', 'customers', 'inventory_movements')
  AND column_name IN ('client_uuid', 'idempotency_key', 'quantity_change');

-- 2. Verify unique indexes are active
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename IN ('sales', 'purchases', 'inventory_movements')
  AND indexname LIKE '%idempotency%' OR indexname LIKE '%client_uuid%';

-- 3. Verify RPC function existence and privileges
SELECT routine_name, routine_type, security_type 
FROM information_schema.routines 
WHERE routine_name IN ('sync_sale_offline', 'sync_purchase_offline');
```

---

## 6. Failure Detection & Trigger Conditions

A migration failure is declared if:
1. PostgreSQL emits a syntax error, lock timeout, or constraint violation during execution.
2. The schema cache fails to reflect new RPC signatures within 60 seconds.
3. Smoke test transactions fail with permission errors (`42501`) or unexpected null constraints.

---

## 7. Recovery Procedures

### Scenario A: Immediate Abort (Within Maintenance Window, Zero Traffic)
If an error occurs while executing `supabase_migration_v5_offline.sql` before client traffic has started:
1. Run `supabase_migration_v5_rollback.sql` Step 1 and Step 2 to remove functions and indexes.
2. Check `inventory_movements`. If empty, drop table.
3. Remove additive columns if needed.
4. Restore previous state.

### Scenario B: Production Restore via PITR or pg_restore
If data corruption occurred or migration was interrupted halfway:
1. In Supabase Dashboard $\to$ **Backups** $\to$ select PITR timestamp 5 minutes prior to migration execution.
2. Trigger point-in-time restore to a new clone database or target branch.
3. Update connection string in CI/CD and redirect traffic.

---

## 8. Forward-Fix Strategy (Preferred Over Rollback)

Because `supabase_migration_v5_offline.sql` is **strictly additive**:
- No existing columns were dropped or renamed.
- No existing constraints were modified destructively.
- Existing legacy queries continue to function without errors.

If an issue arises in stored procedure logic:
1. **DO NOT ROLL BACK THE DATABASE OR DROP COLUMNS**. Dropping `client_uuid` will break client offline queues.
2. Instead, deploy an updated `CREATE OR REPLACE FUNCTION sync_sale_offline(...)` or hotfix script directly.
3. Stored procedures can be replaced in <1 second without downtime or table locks.

---

## 9. Conditions Under Which Rollback is UNSAFE

Executing a rollback (dropping columns or `inventory_movements`) is **STRICTLY UNSAFE** if:
1. **Client devices have synchronized offline transactions**:
   Once an offline bill or purchase syncs to production, it writes `client_uuid` and rows in `inventory_movements`. Dropping these columns or tables will permanently delete cashier transaction references and cause reconciliation discrepancies.
2. **Pending queues exist on cashier devices**:
   If devices have queued items waiting for network connection, rolling back cloud columns will cause the queue drain to fail with missing column errors when devices come online.

