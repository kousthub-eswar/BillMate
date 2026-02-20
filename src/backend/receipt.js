// Receipt utility functions

export function generateReceipt(sale, items, settings) {
    const itemLines = items
        .map(item => `${item.product_name} x${item.quantity} = ${settings.currency}${item.subtotal.toFixed(2)}`)
        .join('\n');

    const date = new Date(sale.date).toLocaleString();

    // Build receipt with optional discount line
    let receiptLines = [
        `🧾 *${settings.shop_name}*`,
        `──────────────`,
        itemLines,
        `──────────────`
    ];

    if (sale.discount_amount && sale.discount_amount > 0) {
        const subtotal = sale.subtotal || (sale.total + sale.discount_amount);
        const discountLabel = sale.discount_type === 'percent'
            ? `${sale.discount_value}%`
            : `${settings.currency}${sale.discount_amount.toFixed(2)}`;
        receiptLines.push(`Subtotal: ${settings.currency}${subtotal.toFixed(2)}`);
        receiptLines.push(`Discount (${discountLabel}): -${settings.currency}${sale.discount_amount.toFixed(2)}`);
        receiptLines.push(`──────────────`);
    }

    receiptLines.push(`*Total: ${settings.currency}${sale.total.toFixed(2)}*`);
    receiptLines.push(`Payment: ${sale.payment_method}`);
    receiptLines.push(`Date: ${date}`);
    receiptLines.push(``);
    receiptLines.push(`Thank you! 🙏`);

    return receiptLines.join('\n');
}

export function shareOnWhatsApp(phoneNumber, message) {
    const encoded = encodeURIComponent(message);
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank');
}
