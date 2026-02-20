// Receipt utility functions

export function generateReceipt(sale, items, settings) {
    let template = settings.receipt_template || `🧾 *{shop_name}*\n──────────────\n{items}\n──────────────\n*Total: {currency}{total}*\nPayment: {payment_method}\nDate: {date}\n\nThank you! 🙏`;

    const itemLines = items
        .map(item => `${item.product_name} x${item.quantity} = ${settings.currency}${item.subtotal.toFixed(2)}`)
        .join('\n');

    const date = new Date(sale.date).toLocaleString();

    template = template
        .replace('{shop_name}', settings.shop_name)
        .replace('{items}', itemLines)
        .replace('{currency}', settings.currency)
        .replace('{total}', sale.total.toFixed(2))
        .replace('{payment_method}', sale.payment_method)
        .replace('{date}', date);

    return template;
}

export function shareOnWhatsApp(phoneNumber, message) {
    const encoded = encodeURIComponent(message);
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank');
}
