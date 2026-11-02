-- ==============================================================
-- BillMate POS — Migration Script v4 → v5 (Offline-First Support)
-- NON-DESTRUCTIVE & FULLY BACKWARD COMPATIBLE
-- DO NOT EXECUTE IN PRODUCTION WITHOUT STAGING VALIDATION
-- ==============================================================

-- 1. Add client_uuid and idempotency_key to core tables
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_uuid text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_user_idempotency ON sales(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_uuid ON sales(user_id, client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS client_uuid text;
CREATE INDEX IF NOT EXISTS idx_products_client_uuid ON products(user_id, client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS client_uuid text;
CREATE INDEX IF NOT EXISTS idx_customers_client_uuid ON customers(user_id, client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS client_uuid text;
CREATE INDEX IF NOT EXISTS idx_suppliers_client_uuid ON suppliers(user_id, client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS client_uuid text;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_user_idempotency ON purchases(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_client_uuid ON purchases(user_id, client_uuid) WHERE client_uuid IS NOT NULL;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS client_uuid text;

-- 2. Create inventory_movements table for delta-based reconciliation
CREATE TABLE IF NOT EXISTS inventory_movements (
  id bigint generated always as identity primary key,
  uuid text not null,
  user_id uuid not null references auth.users(id),
  product_id bigint references products(id) on delete set null,
  product_uuid text,
  quantity_change integer not null,
  movement_type text not null, -- 'SALE', 'PURCHASE', 'RETURN', 'ADJUSTMENT'
  reference_uuid text,
  device_id text,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Unique index per user + movement UUID guarantees exact-once insertion
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_movements_user_uuid ON inventory_movements(user_id, uuid);

-- Indexes & RLS for inventory_movements
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own inventory movements" ON inventory_movements;
CREATE POLICY "Users can manage their own inventory movements"
  ON inventory_movements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_inv_movements_user ON inventory_movements(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_movements_prod ON inventory_movements(user_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_ref ON inventory_movements(user_id, reference_uuid) WHERE reference_uuid IS NOT NULL;

-- 3. Idempotent Offline Sale Sync RPC
CREATE OR REPLACE FUNCTION sync_sale_offline(
  p_client_uuid text,
  p_idempotency_key text,
  p_cart jsonb,
  p_payment_method text,
  p_customer_id bigint DEFAULT NULL,
  p_discount_type text DEFAULT NULL,
  p_discount_value numeric DEFAULT 0,
  p_created_at timestamptz DEFAULT now(),
  p_customer_uuid text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id bigint;
  v_existing_id bigint;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric;
  v_profit numeric := 0;
  v_item_count integer := 0;
  v_item jsonb;
  v_item_product_id bigint;
  v_item_movement_uuid text;
  v_uid uuid := auth.uid();
  v_resolved_customer_id bigint := p_customer_id;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- A. Idempotency Check: return existing transaction on retry
  IF p_idempotency_key IS NOT NULL OR p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM sales
    WHERE ((p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key)
       OR (p_client_uuid IS NOT NULL AND client_uuid = p_client_uuid))
      AND user_id = v_uid LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'saleId', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  -- B. Resolve customer if customer_uuid is provided and p_customer_id is null
  IF v_resolved_customer_id IS NULL AND p_customer_uuid IS NOT NULL THEN
    SELECT id INTO v_resolved_customer_id FROM customers WHERE client_uuid = p_customer_uuid AND user_id = v_uid LIMIT 1;
  END IF;

  -- C. Subtotal and Profit calculation
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart) LOOP
    v_subtotal := v_subtotal + (v_item->>'selling_price')::numeric * (v_item->>'quantity')::integer;
    v_profit := v_profit + ((v_item->>'selling_price')::numeric - coalesce((v_item->>'cost_price')::numeric, 0)) * (v_item->>'quantity')::integer;
    v_item_count := v_item_count + (v_item->>'quantity')::integer;
  END LOOP;

  -- D. Discount calculation
  IF p_discount_value > 0 THEN
    IF p_discount_type = 'percent' THEN
      v_discount_amount := (v_subtotal * p_discount_value) / 100;
    ELSE
      v_discount_amount := least(p_discount_value, v_subtotal);
    END IF;
  END IF;

  v_total := v_subtotal - v_discount_amount;
  v_profit := v_profit - v_discount_amount;

  -- E. Insert Sale with client_uuid, idempotency_key and original client timestamp
  INSERT INTO sales (
    user_id, date, total, subtotal, discount_amount, discount_type,
    discount_value, profit, payment_method, refunded, customer_id,
    item_count, client_uuid, idempotency_key
  ) VALUES (
    v_uid, coalesce(p_created_at, now()), v_total, v_subtotal, v_discount_amount, p_discount_type,
    p_discount_value, v_profit, p_payment_method, false, v_resolved_customer_id,
    v_item_count, p_client_uuid, p_idempotency_key
  ) RETURNING id INTO v_sale_id;

  -- F. Insert Sale Items and apply stock deductions (preserves actual negative oversell quantities)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart) LOOP
    v_item_product_id := coalesce((v_item->>'product_id')::bigint, (v_item->>'id')::bigint);
    v_item_movement_uuid := coalesce(v_item->>'movement_uuid', (v_item->>'uuid'), gen_random_uuid()::text);

    INSERT INTO sale_items (
      user_id, sale_id, product_id, product_name, quantity, selling_price, cost_price, subtotal
    ) VALUES (
      v_uid, v_sale_id, v_item_product_id, v_item->>'product_name',
      (v_item->>'quantity')::integer, (v_item->>'selling_price')::numeric,
      coalesce((v_item->>'cost_price')::numeric, 0),
      (v_item->>'selling_price')::numeric * (v_item->>'quantity')::integer
    );

    IF v_item_product_id IS NOT NULL THEN
      -- Preserves actual negative stock for physical sales oversell reconciliation
      UPDATE products
      SET stock_quantity = stock_quantity - (v_item->>'quantity')::integer,
          updated_at = now()
      WHERE id = v_item_product_id AND user_id = v_uid;

      -- Preserves client-generated movement UUID with ON CONFLICT deduplication
      INSERT INTO inventory_movements (
        uuid, user_id, product_id, product_uuid, quantity_change, movement_type, reference_uuid
      ) VALUES (
        v_item_movement_uuid, v_uid, v_item_product_id, v_item->>'product_uuid',
        -1 * (v_item->>'quantity')::integer, 'SALE', p_client_uuid
      )
      ON CONFLICT (user_id, uuid) DO NOTHING;
    END IF;
  END LOOP;

  -- G. Update customer credit balance if Credit sale
  IF p_payment_method = 'Credit' AND (v_resolved_customer_id IS NOT NULL OR p_customer_uuid IS NOT NULL) THEN
    UPDATE customers
    SET balance = balance + v_total, updated_at = now()
    WHERE ((id = v_resolved_customer_id AND v_resolved_customer_id IS NOT NULL) OR (client_uuid = p_customer_uuid AND p_customer_uuid IS NOT NULL))
      AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'saleId', v_sale_id,
    'client_uuid', p_client_uuid,
    'total', v_total,
    'profit', v_profit
  );
END;
$$;

-- Security hardening
REVOKE ALL ON FUNCTION sync_sale_offline FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_sale_offline TO authenticated;

-- 4. Idempotent Offline Purchase Sync RPC
CREATE OR REPLACE FUNCTION sync_purchase_offline(
  p_client_uuid text,
  p_idempotency_key text,
  p_items jsonb,
  p_total_cost numeric,
  p_supplier_id bigint DEFAULT NULL,
  p_supplier_uuid text DEFAULT NULL,
  p_notes text DEFAULT '',
  p_created_at timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id bigint;
  v_existing_id bigint;
  v_item jsonb;
  v_item_product_id bigint;
  v_item_movement_uuid text;
  v_uid uuid := auth.uid();
  v_resolved_supplier_id bigint := p_supplier_id;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency Check: return existing transaction on retry
  IF p_idempotency_key IS NOT NULL OR p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM purchases
    WHERE ((p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key)
       OR (p_client_uuid IS NOT NULL AND client_uuid = p_client_uuid))
      AND user_id = v_uid LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'purchaseId', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  -- Resolve supplier by UUID if ID is null
  IF v_resolved_supplier_id IS NULL AND p_supplier_uuid IS NOT NULL THEN
    SELECT id INTO v_resolved_supplier_id FROM suppliers WHERE client_uuid = p_supplier_uuid AND user_id = v_uid LIMIT 1;
  END IF;

  -- Insert purchase
  INSERT INTO purchases (
    user_id, supplier_id, date, total_cost, notes, client_uuid, idempotency_key
  ) VALUES (
    v_uid, v_resolved_supplier_id, coalesce(p_created_at, now()), p_total_cost, p_notes, p_client_uuid, p_idempotency_key
  ) RETURNING id INTO v_purchase_id;

  -- Insert items and increment stock atomically
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_product_id := coalesce((v_item->>'product_id')::bigint, (v_item->>'id')::bigint);
    v_item_movement_uuid := coalesce(v_item->>'movement_uuid', (v_item->>'uuid'), gen_random_uuid()::text);

    INSERT INTO purchase_items (
      user_id, purchase_id, product_id, product_name, quantity, purchase_price
    ) VALUES (
      v_uid, v_purchase_id, v_item_product_id, coalesce(v_item->>'product_name', ''),
      (v_item->>'quantity')::integer, (v_item->>'purchase_price')::numeric
    );

    IF v_item_product_id IS NOT NULL THEN
      UPDATE products
      SET stock_quantity = stock_quantity + (v_item->>'quantity')::integer,
          updated_at = now()
      WHERE id = v_item_product_id AND user_id = v_uid;

      INSERT INTO inventory_movements (
        uuid, user_id, product_id, product_uuid, quantity_change, movement_type, reference_uuid
      ) VALUES (
        v_item_movement_uuid, v_uid, v_item_product_id, v_item->>'product_uuid',
        (v_item->>'quantity')::integer, 'PURCHASE', p_client_uuid
      )
      ON CONFLICT (user_id, uuid) DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'purchaseId', v_purchase_id,
    'client_uuid', p_client_uuid
  );
END;
$$;

-- Security hardening
REVOKE ALL ON FUNCTION sync_purchase_offline FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_purchase_offline TO authenticated;
