-- =============================================
-- BillMate POS — Migration Script v2 → v3
-- Adds RPC get_dashboard_stats for efficient single-roundtrip stats fetching
-- =============================================

create or replace function get_dashboard_stats(p_start_date timestamptz, p_end_date timestamptz)
returns json language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_total_revenue numeric(12,2);
  v_total_profit numeric(12,2);
  v_transaction_count integer;
  v_top_products json;
begin
  -- 1. Get aggregate stats from sales
  select 
    coalesce(sum(total), 0), 
    coalesce(sum(profit), 0), 
    count(id)::integer
  into 
    v_total_revenue, 
    v_total_profit, 
    v_transaction_count
  from sales
  where user_id = v_uid
    and date >= p_start_date
    and date <= p_end_date
    and refunded = false
    and payment_method <> 'Settle';

  -- 2. Get top 5 selling products during the period
  select coalesce(json_agg(t), '[]'::json)
  into v_top_products
  from (
    select si.product_name as name, sum(si.quantity)::integer as quantity
    from sale_items si
    join sales s on si.sale_id = s.id
    where s.user_id = v_uid
      and s.date >= p_start_date
      and s.date <= p_end_date
      and s.refunded = false
      and s.payment_method <> 'Settle'
    group by si.product_name
    order by quantity desc, si.product_name
    limit 5
  ) t;

  -- 3. Return combined stats as json object
  return json_build_object(
    'total_revenue', v_total_revenue,
    'total_profit', v_total_profit,
    'transaction_count', v_transaction_count,
    'top_5_products', v_top_products
  );
end;
$$;
