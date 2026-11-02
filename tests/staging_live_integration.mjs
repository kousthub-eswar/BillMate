import { supabase } from '../src/database/supabase.js';
import crypto from 'crypto';

async function runLiveIntegrationTests() {
  console.log('===============================================================');
  console.log('   BILLMATE STAGING LIVE SUPABASE INTEGRATION TEST SUITE       ');
  console.log('===============================================================\n');

  // Ensure authenticated session
  let { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    const loginRes = await supabase.auth.signInWithPassword({
      email: 'test.staging@billmate.app',
      password: 'TestPassword123!'
    });
    if (loginRes.error) {
      throw new Error(`Login failed: ${loginRes.error.message}`);
    }
    authData = loginRes.data;
  }

  const userId = authData.user.id;
  console.log(`[AUTH] Authenticated as user ID: ${userId} (${authData.user.email})\n`);

  const results = [];
  const testRunId = crypto.randomUUID().slice(0, 8);
  const cleanupStack = [];

  async function recordTest(name, fn) {
    process.stdout.write(`TEST: ${name} ... `);
    try {
      await fn();
      console.log('PASSED');
      results.push({ name, status: 'PASSED' });
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      results.push({ name, status: 'FAILED', error: err.message });
    }
  }

  try {
    console.log('--- Setting up live test entities ---');
    const prodUuid = crypto.randomUUID();
    const custUuid = crypto.randomUUID();
    const suppUuid = crypto.randomUUID();

    // 1. Insert Product
    const initialStock = 50;
    const { data: prodData, error: prodErr } = await supabase
      .from('products')
      .insert({
        name: `Test Product ${testRunId}`,
        selling_price: 100,
        cost_price: 60,
        stock_quantity: initialStock,
        client_uuid: prodUuid,
        user_id: userId
      })
      .select()
      .single();
    if (prodErr) throw new Error(`Product setup failed: ${prodErr.message}`);
    const productId = prodData.id;
    cleanupStack.push(async () => supabase.from('products').delete().eq('id', productId));
    console.log(`[SETUP] Product created: ID ${productId}, Initial Stock: ${initialStock}`);

    // 2. Insert Customer
    const { data: custData, error: custErr } = await supabase
      .from('customers')
      .insert({
        name: `Test Customer ${testRunId}`,
        phone: `999${Math.floor(1000000 + Math.random() * 9000000)}`,
        balance: 0,
        client_uuid: custUuid,
        user_id: userId
      })
      .select()
      .single();
    if (custErr) throw new Error(`Customer setup failed: ${custErr.message}`);
    const customerId = custData.id;
    cleanupStack.push(async () => supabase.from('customers').delete().eq('id', customerId));
    console.log(`[SETUP] Customer created: ID ${customerId}`);

    // 3. Insert Supplier
    const { data: suppData, error: suppErr } = await supabase
      .from('suppliers')
      .insert({
        name: `Test Supplier ${testRunId}`,
        phone: `888${Math.floor(1000000 + Math.random() * 9000000)}`,
        client_uuid: suppUuid,
        user_id: userId
      })
      .select()
      .single();
    if (suppErr) throw new Error(`Supplier setup failed: ${suppErr.message}`);
    const supplierId = suppData.id;
    cleanupStack.push(async () => supabase.from('suppliers').delete().eq('id', supplierId));
    console.log(`[SETUP] Supplier created: ID ${supplierId}\n`);

    // -------------------------------------------------------------
    // SCENARIO 1: sync_sale_offline creates sale headers and items
    // -------------------------------------------------------------
    const sale1ClientUuid = crypto.randomUUID();
    const sale1IdempotencyKey = `sale_${testRunId}_001`;
    const sale1MovementUuid = crypto.randomUUID();
    let createdSale1Id = null;

    await recordTest('1. sync_sale_offline creates sale header and line items', async () => {
      const cart = [
        {
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 2,
          selling_price: 100,
          cost_price: 60,
          movement_uuid: sale1MovementUuid
        }
      ];

      const { data, error } = await supabase.rpc('sync_sale_offline', {
        p_client_uuid: sale1ClientUuid,
        p_idempotency_key: sale1IdempotencyKey,
        p_cart: cart,
        p_payment_method: 'Credit',
        p_customer_id: customerId,
        p_discount_type: 'amount',
        p_discount_value: 10,
        p_created_at: new Date().toISOString(),
        p_customer_uuid: custUuid
      });

      if (error) throw new Error(`RPC error: ${error.message}`);
      if (!data || !data.saleId) throw new Error(`Expected saleId in response, got: ${JSON.stringify(data)}`);
      createdSale1Id = data.saleId;
      cleanupStack.push(async () => supabase.from('sales').delete().eq('id', createdSale1Id));

      // Verify header in database
      const { data: dbSale, error: dbSaleErr } = await supabase
        .from('sales')
        .select('*')
        .eq('id', createdSale1Id)
        .single();
      if (dbSaleErr || !dbSale) throw new Error(`Sale not found in DB: ${dbSaleErr?.message}`);
      if (dbSale.client_uuid !== sale1ClientUuid) throw new Error(`client_uuid mismatch: ${dbSale.client_uuid}`);
      if (dbSale.idempotency_key !== sale1IdempotencyKey) throw new Error(`idempotency_key mismatch: ${dbSale.idempotency_key}`);
      if (Number(dbSale.total) !== 190) throw new Error(`Sale total mismatch: expected 190, got ${dbSale.total}`);

      // Verify line items
      const { data: dbItems, error: dbItemsErr } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', createdSale1Id);
      if (dbItemsErr || !dbItems || dbItems.length !== 1) throw new Error(`Expected 1 sale item, got ${dbItems?.length}`);
      if (dbItems[0].quantity !== 2) throw new Error(`Expected quantity 2, got ${dbItems[0].quantity}`);
    });

    // -------------------------------------------------------------
    // SCENARIO 2: Stock decremented exactly once
    // -------------------------------------------------------------
    await recordTest('2. Product stock decremented atomically by exact sale quantity', async () => {
      const { data: curProd, error } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', productId)
        .single();
      if (error) throw new Error(`Failed to read product: ${error.message}`);
      const expected = initialStock - 2; // 50 - 2 = 48
      if (curProd.stock_quantity !== expected) {
        throw new Error(`Stock mismatch: expected ${expected}, found ${curProd.stock_quantity}`);
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 3: Customer credit balance updated exactly once
    // -------------------------------------------------------------
    await recordTest('3. Customer credit balance updated atomically for credit sale', async () => {
      const { data: curCust, error } = await supabase
        .from('customers')
        .select('balance')
        .eq('id', customerId)
        .single();
      if (error) throw new Error(`Failed to read customer: ${error.message}`);
      if (Number(curCust.balance) !== 190) {
        throw new Error(`Customer balance mismatch: expected 190, found ${curCust.balance}`);
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 4: Idempotent sale retry returns original sale ID & no double deduction
    // -------------------------------------------------------------
    await recordTest('4. Idempotent sale retry returns duplicate:true without double deduction', async () => {
      const cart = [
        {
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 2,
          selling_price: 100,
          cost_price: 60,
          movement_uuid: sale1MovementUuid
        }
      ];

      const { data, error } = await supabase.rpc('sync_sale_offline', {
        p_client_uuid: sale1ClientUuid,
        p_idempotency_key: sale1IdempotencyKey,
        p_cart: cart,
        p_payment_method: 'Credit',
        p_customer_id: customerId,
        p_discount_type: 'amount',
        p_discount_value: 10,
        p_created_at: new Date().toISOString(),
        p_customer_uuid: custUuid
      });

      if (error) throw new Error(`RPC error on retry: ${error.message}`);
      if (!data.duplicate) throw new Error(`Expected duplicate: true, got ${JSON.stringify(data)}`);
      if (data.saleId !== createdSale1Id) throw new Error(`Expected saleId ${createdSale1Id}, got ${data.saleId}`);

      // Verify stock did NOT decrement again
      const { data: curProd } = await supabase.from('products').select('stock_quantity').eq('id', productId).single();
      if (curProd.stock_quantity !== 48) {
        throw new Error(`Stock corrupted on retry: expected 48, got ${curProd.stock_quantity}`);
      }

      // Verify customer balance did NOT increase again
      const { data: curCust } = await supabase.from('customers').select('balance').eq('id', customerId).single();
      if (Number(curCust.balance) !== 190) {
        throw new Error(`Customer balance corrupted on retry: expected 190, got ${curCust.balance}`);
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 5: sync_purchase_offline creates purchase header and items
    // -------------------------------------------------------------
    const purch1ClientUuid = crypto.randomUUID();
    const purch1IdempotencyKey = `purch_${testRunId}_001`;
    const purch1MovementUuid = crypto.randomUUID();
    let createdPurch1Id = null;

    await recordTest('5. sync_purchase_offline creates purchase header and items', async () => {
      const items = [
        {
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 10,
          purchase_price: 60,
          movement_uuid: purch1MovementUuid
        }
      ];

      const { data, error } = await supabase.rpc('sync_purchase_offline', {
        p_client_uuid: purch1ClientUuid,
        p_idempotency_key: purch1IdempotencyKey,
        p_items: items,
        p_total_cost: 600,
        p_supplier_id: supplierId,
        p_supplier_uuid: suppUuid,
        p_notes: 'Live integration purchase test',
        p_created_at: new Date().toISOString()
      });

      if (error) throw new Error(`RPC error: ${error.message}`);
      if (!data || !data.purchaseId) throw new Error(`Expected purchaseId, got: ${JSON.stringify(data)}`);
      createdPurch1Id = data.purchaseId;
      cleanupStack.push(async () => supabase.from('purchases').delete().eq('id', createdPurch1Id));

      // Verify header in DB
      const { data: dbPurch, error: dbPurchErr } = await supabase
        .from('purchases')
        .select('*')
        .eq('id', createdPurch1Id)
        .single();
      if (dbPurchErr || !dbPurch) throw new Error(`Purchase not found in DB: ${dbPurchErr?.message}`);
      if (dbPurch.client_uuid !== purch1ClientUuid) throw new Error(`client_uuid mismatch: ${dbPurch.client_uuid}`);
      if (dbPurch.idempotency_key !== purch1IdempotencyKey) throw new Error(`idempotency_key mismatch: ${dbPurch.idempotency_key}`);
      if (Number(dbPurch.total_cost) !== 600) throw new Error(`total_cost mismatch: ${dbPurch.total_cost}`);
    });

    // -------------------------------------------------------------
    // SCENARIO 6: Purchase stock incremented exactly once
    // -------------------------------------------------------------
    await recordTest('6. Purchase atomically increments product stock quantity', async () => {
      const { data: curProd, error } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', productId)
        .single();
      if (error) throw new Error(`Failed to read product: ${error.message}`);
      // Stock was 48, added 10 -> should be 58
      if (curProd.stock_quantity !== 58) {
        throw new Error(`Stock mismatch: expected 58, found ${curProd.stock_quantity}`);
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 7: Purchase idempotency prevents duplicate records
    // -------------------------------------------------------------
    await recordTest('7. Purchase idempotency returns duplicate:true and preserves stock', async () => {
      const items = [
        {
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 10,
          purchase_price: 60,
          movement_uuid: purch1MovementUuid
        }
      ];

      const { data, error } = await supabase.rpc('sync_purchase_offline', {
        p_client_uuid: purch1ClientUuid,
        p_idempotency_key: purch1IdempotencyKey,
        p_items: items,
        p_total_cost: 600,
        p_supplier_id: supplierId,
        p_supplier_uuid: suppUuid,
        p_notes: 'Live integration purchase test',
        p_created_at: new Date().toISOString()
      });

      if (error) throw new Error(`RPC error on retry: ${error.message}`);
      if (!data.duplicate) throw new Error(`Expected duplicate: true, got ${JSON.stringify(data)}`);
      if (data.purchaseId !== createdPurch1Id) throw new Error(`Expected purchaseId ${createdPurch1Id}, got ${data.purchaseId}`);

      // Check stock remains 58
      const { data: curProd } = await supabase.from('products').select('stock_quantity').eq('id', productId).single();
      if (curProd.stock_quantity !== 58) {
        throw new Error(`Stock corrupted: expected 58, got ${curProd.stock_quantity}`);
      }
    });

    // -------------------------------------------------------------
    // SCENARIO 8: Inventory movement UUIDs preserved
    // -------------------------------------------------------------
    await recordTest('8. Inventory movement UUIDs preserved exactly as generated on client', async () => {
      const { data: saleMov, error: saleMovErr } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('uuid', sale1MovementUuid)
        .single();
      if (saleMovErr || !saleMov) throw new Error(`Sale movement not found by client UUID: ${saleMovErr?.message}`);
      if (saleMov.quantity_change !== -2) throw new Error(`Movement qty mismatch: ${saleMov.quantity_change}`);

      const { data: purchMov, error: purchMovErr } = await supabase
        .from('inventory_movements')
        .select('*')
        .eq('uuid', purch1MovementUuid)
        .single();
      if (purchMovErr || !purchMov) throw new Error(`Purchase movement not found by client UUID: ${purchMovErr?.message}`);
      if (purchMov.quantity_change !== 10) throw new Error(`Movement qty mismatch: ${purchMov.quantity_change}`);
    });

    // -------------------------------------------------------------
    // SCENARIO 9: Two-device sync without movement loss
    // -------------------------------------------------------------
    await recordTest('9. Two-device concurrent sync simulation preserves all movements', async () => {
      const devA_uuid = crypto.randomUUID();
      const devB_uuid = crypto.randomUUID();
      const movA_uuid = crypto.randomUUID();
      const movB_uuid = crypto.randomUUID();

      // Device A sells 3
      const { data: resA, error: errA } = await supabase.rpc('sync_sale_offline', {
        p_client_uuid: devA_uuid,
        p_idempotency_key: `sale_devA_${testRunId}`,
        p_cart: [{
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 3,
          selling_price: 100,
          cost_price: 60,
          movement_uuid: movA_uuid
        }],
        p_payment_method: 'Cash',
        p_created_at: new Date().toISOString()
      });
      if (errA) throw new Error(`Dev A sync failed: ${errA.message}`);
      cleanupStack.push(async () => supabase.from('sales').delete().eq('id', resA.saleId));

      // Device B sells 5
      const { data: resB, error: errB } = await supabase.rpc('sync_sale_offline', {
        p_client_uuid: devB_uuid,
        p_idempotency_key: `sale_devB_${testRunId}`,
        p_cart: [{
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 5,
          selling_price: 100,
          cost_price: 60,
          movement_uuid: movB_uuid
        }],
        p_payment_method: 'Cash',
        p_created_at: new Date().toISOString()
      });
      if (errB) throw new Error(`Dev B sync failed: ${errB.message}`);
      cleanupStack.push(async () => supabase.from('sales').delete().eq('id', resB.saleId));

      // Stock was 58, minus 3 minus 5 = 50
      const { data: curProd } = await supabase.from('products').select('stock_quantity').eq('id', productId).single();
      if (curProd.stock_quantity !== 50) {
        throw new Error(`Concurrent stock mismatch: expected 50, found ${curProd.stock_quantity}`);
      }

      // Both movements must exist
      const { data: movs } = await supabase
        .from('inventory_movements')
        .select('uuid')
        .in('uuid', [movA_uuid, movB_uuid]);
      if (movs.length !== 2) throw new Error(`Expected 2 movements preserved, found ${movs.length}`);
    });

    // -------------------------------------------------------------
    // SCENARIO 10: Lost HTTP ACKs simulated (client retry after network drop)
    // -------------------------------------------------------------
    await recordTest('10. Lost HTTP ACK recovery: resend yields safe identical transaction response', async () => {
      const ackClientUuid = crypto.randomUUID();
      const ackIdempotencyKey = `ack_${testRunId}`;
      const ackMovUuid = crypto.randomUUID();

      // First call simulates request reaching server but client dropping before ACK
      const { data: firstRes, error: firstErr } = await supabase.rpc('sync_sale_offline', {
        p_client_uuid: ackClientUuid,
        p_idempotency_key: ackIdempotencyKey,
        p_cart: [{
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 1,
          selling_price: 100,
          cost_price: 60,
          movement_uuid: ackMovUuid
        }],
        p_payment_method: 'Cash',
        p_created_at: new Date().toISOString()
      });
      if (firstErr) throw new Error(`Initial attempt failed: ${firstErr.message}`);
      cleanupStack.push(async () => supabase.from('sales').delete().eq('id', firstRes.saleId));

      // Second call simulates retry with same idempotency key
      const { data: retryRes, error: retryErr } = await supabase.rpc('sync_sale_offline', {
        p_client_uuid: ackClientUuid,
        p_idempotency_key: ackIdempotencyKey,
        p_cart: [{
          product_id: productId,
          product_uuid: prodUuid,
          product_name: `Test Product ${testRunId}`,
          quantity: 1,
          selling_price: 100,
          cost_price: 60,
          movement_uuid: ackMovUuid
        }],
        p_payment_method: 'Cash',
        p_created_at: new Date().toISOString()
      });
      if (retryErr) throw new Error(`Retry failed: ${retryErr.message}`);
      if (retryRes.saleId !== firstRes.saleId) {
        throw new Error(`Sale ID mismatch on retry: original ${firstRes.saleId}, retry ${retryRes.saleId}`);
      }
      if (!retryRes.duplicate) throw new Error('Expected retryRes.duplicate to be true');
    });

    // -------------------------------------------------------------
    // SCENARIO 11: Legacy cloud records compatibility
    // -------------------------------------------------------------
    await recordTest('11. Legacy cloud records without client_uuid remain fully accessible', async () => {
      const { data: legSale, error: legErr } = await supabase
        .from('sales')
        .insert({
          payment_method: 'Cash',
          total: 50,
          subtotal: 50,
          profit: 10,
          user_id: userId
        })
        .select()
        .single();
      if (legErr) throw new Error(`Legacy insert failed: ${legErr.message}`);
      cleanupStack.push(async () => supabase.from('sales').delete().eq('id', legSale.id));

      const { data: fetched, error: fetchErr } = await supabase
        .from('sales')
        .select('*')
        .eq('id', legSale.id)
        .single();
      if (fetchErr || !fetched) throw new Error(`Failed to query legacy sale: ${fetchErr?.message}`);
      if (fetched.client_uuid !== null) throw new Error(`Expected null client_uuid for legacy record`);
    });

    // -------------------------------------------------------------
    // SCENARIO 12: RLS tenant isolation & cross-user access prevention
    // -------------------------------------------------------------
    await recordTest('12. RLS enforces tenant boundaries & prevents cross-tenant access', async () => {
      const { data: userSales, error: rlsErr } = await supabase
        .from('sales')
        .select('user_id')
        .limit(10);
      if (rlsErr) throw new Error(`Query failed: ${rlsErr.message}`);
      const foreignRows = userSales.filter(s => s.user_id !== userId);
      if (foreignRows.length > 0) {
        throw new Error(`RLS breach: detected ${foreignRows.length} rows belonging to another user!`);
      }
    });

  } finally {
    console.log('\n--- Cleaning up test records ---');
    for (const cleanFn of cleanupStack.reverse()) {
      try {
        await cleanFn();
      } catch (e) {
        console.warn('Cleanup step failed:', e.message);
      }
    }
    console.log('Cleanup complete.');
  }

  console.log('\n===============================================================');
  console.log('                      TEST SUMMARY                             ');
  console.log('===============================================================');
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  console.log(`TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);

  if (failed > 0) {
    throw new Error(`${failed} integration test(s) failed.`);
  }
}

runLiveIntegrationTests().catch(err => {
  console.error('\nFATAL ERROR IN LIVE INTEGRATION TEST SUITE:', err);
  process.exit(1);
});
