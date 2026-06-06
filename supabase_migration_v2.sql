-- =============================================
-- BillMate POS — Migration Script v1 → v2
-- Multi-tenant: adds user_id to all tables
-- =============================================
-- 
-- INSTRUCTIONS:
-- 1. Run this in Supabase SQL Editor
-- 2. Replace YOUR_USER_UUID below with your actual auth.users ID
--    (Find it in: Authentication > Users in Supabase dashboard)
-- 3. This script:
--    a) Adds user_id columns to ALL tables
--    b) Stamps existing rows with your user ID
--    c) Drops old blanket RLS policies
--    d) Creates new scoped RLS policies (SELECT/INSERT/UPDATE/DELETE)
--    e) Updates the settings table to use composite PK
-- =============================================

-- !! IMPORTANT: Replace this UUID with your actual user ID !!
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the first (likely only) user from auth.users
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users. Sign up first, then run this migration.';
  END IF;

  RAISE NOTICE 'Migrating data for user: %', v_user_id;

  -- ==========================================
  -- STEP 1: Add user_id columns (if not exist)
  -- ==========================================
  
  -- Products
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'user_id') THEN
    ALTER TABLE products ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE products SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE products ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);
  END IF;

  -- Customers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'user_id') THEN
    ALTER TABLE customers ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE customers SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE customers ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
  END IF;

  -- Suppliers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'user_id') THEN
    ALTER TABLE suppliers ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE suppliers SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE suppliers ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_suppliers_user ON suppliers(user_id);
  END IF;

  -- Sales
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'user_id') THEN
    ALTER TABLE sales ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE sales SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE sales ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
  END IF;

  -- Sale Items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'user_id') THEN
    ALTER TABLE sale_items ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE sale_items SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE sale_items ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sale_items_user ON sale_items(user_id);
  END IF;

  -- Purchases
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchases' AND column_name = 'user_id') THEN
    ALTER TABLE purchases ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE purchases SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE purchases ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
  END IF;

  -- Purchase Items
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_items' AND column_name = 'user_id') THEN
    ALTER TABLE purchase_items ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE purchase_items SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE purchase_items ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_purchase_items_user ON purchase_items(user_id);
  END IF;

  -- Expenses
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'user_id') THEN
    ALTER TABLE expenses ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE expenses SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
  END IF;

  -- Audit Logs (user_id may already exist but be nullable)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'user_id') THEN
    ALTER TABLE audit_logs ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
  UPDATE audit_logs SET user_id = v_user_id WHERE user_id IS NULL;

  -- Settings: add user_id, migrate to composite PK
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'user_id') THEN
    ALTER TABLE settings ADD COLUMN user_id uuid REFERENCES auth.users(id);
    UPDATE settings SET user_id = v_user_id WHERE user_id IS NULL;
    ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL;
    -- Drop old PK and create composite PK
    ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
    ALTER TABLE settings ADD PRIMARY KEY (key, user_id);
    CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id);
  END IF;

END $$;

-- ==========================================
-- STEP 2: Drop old blanket RLS policies
-- ==========================================

DROP POLICY IF EXISTS "auth_full" ON products;
DROP POLICY IF EXISTS "auth_full" ON customers;
DROP POLICY IF EXISTS "auth_full" ON suppliers;
DROP POLICY IF EXISTS "auth_full" ON sales;
DROP POLICY IF EXISTS "auth_full" ON sale_items;
DROP POLICY IF EXISTS "auth_full" ON purchases;
DROP POLICY IF EXISTS "auth_full" ON purchase_items;
DROP POLICY IF EXISTS "auth_full" ON expenses;
DROP POLICY IF EXISTS "auth_full" ON settings;
DROP POLICY IF EXISTS "auth_full" ON audit_logs;

-- ==========================================
-- STEP 3: Create scoped RLS policies
-- ==========================================

-- Products
CREATE POLICY "products_select" ON products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "products_update" ON products FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "products_delete" ON products FOR DELETE USING (auth.uid() = user_id);

-- Customers
CREATE POLICY "customers_select" ON customers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers_delete" ON customers FOR DELETE USING (auth.uid() = user_id);

-- Suppliers
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE USING (auth.uid() = user_id);

-- Sales
CREATE POLICY "sales_select" ON sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sales_insert" ON sales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sales_update" ON sales FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sales_delete" ON sales FOR DELETE USING (auth.uid() = user_id);

-- Sale Items
CREATE POLICY "sale_items_select" ON sale_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sale_items_insert" ON sale_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sale_items_update" ON sale_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sale_items_delete" ON sale_items FOR DELETE USING (auth.uid() = user_id);

-- Purchases
CREATE POLICY "purchases_select" ON purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "purchases_insert" ON purchases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "purchases_update" ON purchases FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "purchases_delete" ON purchases FOR DELETE USING (auth.uid() = user_id);

-- Purchase Items
CREATE POLICY "purchase_items_select" ON purchase_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "purchase_items_insert" ON purchase_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "purchase_items_update" ON purchase_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "purchase_items_delete" ON purchase_items FOR DELETE USING (auth.uid() = user_id);

-- Expenses
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (auth.uid() = user_id);

-- Settings
CREATE POLICY "settings_select" ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_update" ON settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_delete" ON settings FOR DELETE USING (auth.uid() = user_id);

-- Audit Logs
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (auth.uid() = user_id);


-- ==========================================
-- STEP 4: Update RPC functions (multi-tenant)
-- ==========================================
-- Run the updated supabase_schema.sql for the latest RPC functions.
-- The RPC functions are defined with CREATE OR REPLACE, so they are safe to re-run.

SELECT 'Migration complete! All tables now have user_id columns and scoped RLS policies.' as status;
