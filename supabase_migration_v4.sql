-- =============================================
-- BillMate POS — Migration Script v3 → v4
-- Adds is_active column to products, and defines performance indexes
-- =============================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active boolean not null default true;

CREATE INDEX IF NOT EXISTS idx_sales_user_created ON sales(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_products_user_active ON products(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user_created ON purchases(user_id, created_at DESC);
