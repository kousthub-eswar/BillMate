-- =============================================
-- BillMate POS — Complete Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- =============================================

-- ==================
-- 1. CORE TABLES
-- ==================

create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  selling_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  stock_quantity integer not null default 0,
  category text not null default 'General',
  frequently_used smallint not null default 0,
  barcode text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text default '',
  balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suppliers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text default '',
  address text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales (
  id bigint generated always as identity primary key,
  date timestamptz not null default now(),
  total numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  discount_type text,
  discount_value numeric(12,2) not null default 0,
  profit numeric(12,2) not null default 0,
  payment_method text not null default 'Cash',
  refunded boolean not null default false,
  customer_id bigint references customers(id) on delete set null,
  item_count integer not null default 0,
  settle_amount numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references sales(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 0,
  selling_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0
);

create table if not exists purchases (
  id bigint generated always as identity primary key,
  supplier_id bigint references suppliers(id) on delete set null,
  date timestamptz not null default now(),
  total_cost numeric(12,2) not null default 0,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists purchase_items (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references purchases(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  product_name text not null default '',
  quantity integer not null default 0,
  purchase_price numeric(12,2) not null default 0
);

create table if not exists expenses (
  id bigint generated always as identity primary key,
  type text not null,
  amount numeric(12,2) not null default 0,
  date timestamptz not null default now(),
  note text default '',
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value text not null
);

-- ==================
-- 2. AUDIT LOGS
-- ==================

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  action text not null,
  table_name text not null,
  record_id bigint,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

-- ==================
-- 3. INDEXES
-- ==================

create index if not exists idx_sales_date on sales(date);
create index if not exists idx_sales_customer on sales(customer_id);
create index if not exists idx_sales_payment on sales(payment_method);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_sale_items_product on sale_items(product_id);
create index if not exists idx_products_category on products(category);
create index if not exists idx_products_name on products(name);
create index if not exists idx_products_barcode on products(barcode);
create index if not exists idx_purchases_supplier on purchases(supplier_id);
create index if not exists idx_purchases_date on purchases(date);
create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);
create index if not exists idx_expenses_date on expenses(date);
create index if not exists idx_customers_name on customers(name);
create index if not exists idx_suppliers_name on suppliers(name);
create index if not exists idx_audit_logs_table on audit_logs(table_name);
create index if not exists idx_audit_logs_created on audit_logs(created_at);

-- ==================
-- 4. AUTO-LOGGING TRIGGER
-- ==================

create or replace function log_change()
returns trigger as $$
begin
  insert into audit_logs (action, table_name, record_id, old_data, new_data, user_id)
  values (
    TG_OP,
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then OLD.id else NEW.id end,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end,
    auth.uid()
  );
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

create trigger trg_products after insert or update or delete on products for each row execute function log_change();
create trigger trg_sales after insert or update or delete on sales for each row execute function log_change();
create trigger trg_sale_items after insert or update or delete on sale_items for each row execute function log_change();
create trigger trg_customers after insert or update or delete on customers for each row execute function log_change();
create trigger trg_suppliers after insert or update or delete on suppliers for each row execute function log_change();
create trigger trg_purchases after insert or update or delete on purchases for each row execute function log_change();
create trigger trg_purchase_items after insert or update or delete on purchase_items for each row execute function log_change();
create trigger trg_expenses after insert or update or delete on expenses for each row execute function log_change();

-- ==================
-- 5. RPC: create_sale (atomic)
-- ==================

create or replace function create_sale(
  p_cart jsonb,
  p_payment_method text,
  p_customer_id bigint default null,
  p_discount_type text default null,
  p_discount_value numeric default 0
) returns jsonb language plpgsql security definer as $$
declare
  v_sale_id bigint;
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total numeric;
  v_profit numeric := 0;
  v_item_count integer := 0;
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(p_cart) loop
    v_subtotal := v_subtotal + (v_item->>'selling_price')::numeric * (v_item->>'quantity')::integer;
    v_profit := v_profit + ((v_item->>'selling_price')::numeric - coalesce((v_item->>'cost_price')::numeric,0)) * (v_item->>'quantity')::integer;
    v_item_count := v_item_count + (v_item->>'quantity')::integer;
  end loop;

  if p_discount_value > 0 then
    if p_discount_type = 'percent' then
      v_discount_amount := (v_subtotal * p_discount_value) / 100;
    else
      v_discount_amount := least(p_discount_value, v_subtotal);
    end if;
  end if;

  v_total := v_subtotal - v_discount_amount;
  v_profit := v_profit - v_discount_amount;

  insert into sales (date, total, subtotal, discount_amount, discount_type, discount_value, profit, payment_method, refunded, customer_id, item_count)
  values (now(), v_total, v_subtotal, v_discount_amount, p_discount_type, p_discount_value, v_profit, p_payment_method, false, p_customer_id, v_item_count)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_cart) loop
    insert into sale_items (sale_id, product_id, product_name, quantity, selling_price, cost_price, subtotal)
    values (v_sale_id, (v_item->>'id')::bigint, v_item->>'name', (v_item->>'quantity')::integer, (v_item->>'selling_price')::numeric, coalesce((v_item->>'cost_price')::numeric,0), (v_item->>'selling_price')::numeric * (v_item->>'quantity')::integer);

    update products set stock_quantity = greatest(0, stock_quantity - (v_item->>'quantity')::integer), updated_at = now()
    where id = (v_item->>'id')::bigint;
  end loop;

  if p_payment_method = 'Credit' and p_customer_id is not null then
    update customers set balance = balance + v_total, updated_at = now() where id = p_customer_id;
  end if;

  return jsonb_build_object('saleId', v_sale_id, 'total', v_total, 'profit', v_profit);
end;
$$;

-- ==================
-- 6. RPC: refund_sale (atomic)
-- ==================

create or replace function refund_sale(p_sale_id bigint)
returns boolean language plpgsql security definer as $$
declare
  v_sale record;
  v_item record;
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale.refunded then raise exception 'Already refunded'; end if;

  update sales set refunded = true where id = p_sale_id;

  for v_item in select * from sale_items where sale_id = p_sale_id loop
    update products set stock_quantity = stock_quantity + v_item.quantity, updated_at = now() where id = v_item.product_id;
  end loop;

  if v_sale.payment_method = 'Credit' and v_sale.customer_id is not null then
    update customers set balance = greatest(0, balance - v_sale.total), updated_at = now() where id = v_sale.customer_id;
  end if;

  return true;
end;
$$;

-- ==================
-- 7. RPC: undo_last_sale (atomic)
-- ==================

create or replace function undo_last_sale()
returns jsonb language plpgsql security definer as $$
declare
  v_sale record;
  v_item record;
begin
  select * into v_sale from sales where refunded = false and payment_method != 'Settle' order by date desc limit 1;
  if not found then return jsonb_build_object('success', false, 'message', 'No recent sale to undo'); end if;

  update sales set refunded = true where id = v_sale.id;

  for v_item in select * from sale_items where sale_id = v_sale.id loop
    update products set stock_quantity = stock_quantity + v_item.quantity, updated_at = now() where id = v_item.product_id;
  end loop;

  if v_sale.payment_method = 'Credit' and v_sale.customer_id is not null then
    update customers set balance = greatest(0, balance - v_sale.total), updated_at = now() where id = v_sale.customer_id;
  end if;

  return jsonb_build_object('success', true, 'sale', to_jsonb(v_sale));
end;
$$;

-- ==================
-- 8. RPC: create_purchase (atomic)
-- ==================

create or replace function create_purchase(
  p_supplier_id bigint,
  p_items jsonb,
  p_notes text default ''
) returns jsonb language plpgsql security definer as $$
declare
  v_purchase_id bigint;
  v_total_cost numeric := 0;
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_total_cost := v_total_cost + (v_item->>'quantity')::integer * (v_item->>'purchase_price')::numeric;
  end loop;

  insert into purchases (supplier_id, date, total_cost, notes)
  values (p_supplier_id, now(), v_total_cost, p_notes)
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into purchase_items (purchase_id, product_id, product_name, quantity, purchase_price)
    values (v_purchase_id, (v_item->>'product_id')::bigint, v_item->>'product_name', (v_item->>'quantity')::integer, (v_item->>'purchase_price')::numeric);

    update products set
      stock_quantity = stock_quantity + (v_item->>'quantity')::integer,
      cost_price = case when (v_item->>'purchase_price')::numeric > 0 then (v_item->>'purchase_price')::numeric else cost_price end,
      updated_at = now()
    where id = (v_item->>'product_id')::bigint;
  end loop;

  return jsonb_build_object('purchaseId', v_purchase_id, 'totalCost', v_total_cost);
end;
$$;

-- ==================
-- 9. RPC: delete_purchase (atomic, reverses stock)
-- ==================

create or replace function delete_purchase(p_purchase_id bigint)
returns boolean language plpgsql security definer as $$
declare
  v_item record;
begin
  for v_item in select * from purchase_items where purchase_id = p_purchase_id loop
    update products set stock_quantity = greatest(0, stock_quantity - v_item.quantity), updated_at = now() where id = v_item.product_id;
  end loop;

  delete from purchase_items where purchase_id = p_purchase_id;
  delete from purchases where id = p_purchase_id;
  return true;
end;
$$;

-- ==================
-- 10. RPC: quick_restock (atomic)
-- ==================

create or replace function quick_restock(
  p_product_id bigint,
  p_quantity integer,
  p_purchase_price numeric,
  p_supplier_id bigint default null
) returns jsonb language plpgsql security definer as $$
declare
  v_product record;
  v_purchase_id bigint;
  v_total numeric;
begin
  select * into v_product from products where id = p_product_id;
  if not found then raise exception 'Product not found'; end if;

  v_total := p_quantity * p_purchase_price;

  insert into purchases (supplier_id, date, total_cost, notes)
  values (p_supplier_id, now(), v_total, 'Quick restock: ' || v_product.name)
  returning id into v_purchase_id;

  insert into purchase_items (purchase_id, product_id, product_name, quantity, purchase_price)
  values (v_purchase_id, p_product_id, v_product.name, p_quantity, p_purchase_price);

  update products set
    stock_quantity = stock_quantity + p_quantity,
    cost_price = case when p_purchase_price > 0 then p_purchase_price else cost_price end,
    updated_at = now()
  where id = p_product_id;

  return jsonb_build_object('purchaseId', v_purchase_id, 'totalCost', v_total);
end;
$$;

-- ==================
-- 11. ROW LEVEL SECURITY
-- ==================

alter table products enable row level security;
alter table customers enable row level security;
alter table suppliers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table expenses enable row level security;
alter table settings enable row level security;
alter table audit_logs enable row level security;

create policy "auth_full" on products for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on suppliers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on sales for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on sale_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on purchases for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on purchase_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on expenses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full" on audit_logs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ==================
-- 12. DEFAULT SETTINGS
-- ==================

insert into settings (key, value) values
  ('shop_name', 'My Shop'),
  ('currency', '₹'),
  ('low_stock_threshold', '5'),
  ('receipt_template', '🧾 *{shop_name}*
──────────────
{items}
──────────────
*Total: {currency}{total}*
Payment: {payment_method}
Date: {date}

Thank you for shopping with us! 🙏')
on conflict (key) do nothing;
