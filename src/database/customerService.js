import { db } from './db';

export async function addCustomer(customer) {
    return await db.customers.add({
        name: customer.name,
        phone: customer.phone,
        balance: 0 // Positive balance means customer owes money (Credit)
    });
}

export async function getAllCustomers() {
    return await db.customers.toArray();
}

export async function getCustomerById(id) {
    return await db.customers.get(id);
}

export async function updateCustomerBalance(id, amount) {
    // Amount can be positive (credit sale) or negative (settlement)
    const customer = await db.customers.get(id);
    if (customer) {
        const newBalance = (customer.balance || 0) + amount;
        await db.customers.update(id, { balance: newBalance });
        return newBalance;
    }
    return null;
}

export async function getCustomerHistory(customerId) {
    // Get credit sales and settlements
    // Settlements will be stored in 'expenses' or a new table?
    // Ideally settlements should be their own record type, but for simplicity
    // we can query sales with 'Credit' method + specific settlement records.

    // For V1, we just track current balance.
    // Advanced history would need a 'ledger' table.
    // We'll filter sales by customer_id.

    const sales = await db.sales
        .where('customer_id')
        .equals(customerId)
        .toArray();

    return sales;
}

export async function searchCustomers(query) {
    const lower = query.toLowerCase();
    return await db.customers
        .filter(c =>
            c.name.toLowerCase().includes(lower) ||
            c.phone.includes(query)
        )
        .toArray();
}
