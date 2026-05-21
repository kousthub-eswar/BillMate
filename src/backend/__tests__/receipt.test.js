import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateReceipt, shareOnWhatsApp } from '../receipt';

describe('receipt.js', () => {
    describe('generateReceipt', () => {
        const settings = {
            shop_name: 'SuperMart',
            currency: '$'
        };

        const items = [
            { product_name: 'Apple', quantity: 2, subtotal: 4.5 },
            { product_name: 'Banana', quantity: 3, subtotal: 3.0 }
        ];

        it('should generate a standard receipt format without discount', () => {
            const sale = {
                date: '2026-05-21T10:00:00Z',
                total: 7.5,
                payment_method: 'Cash'
            };

            const receipt = generateReceipt(sale, items, settings);

            expect(receipt).toContain('🧾 *SuperMart*');
            expect(receipt).toContain('Apple x2 = $4.50');
            expect(receipt).toContain('Banana x3 = $3.00');
            expect(receipt).toContain('*Total: $7.50*');
            expect(receipt).toContain('Payment: Cash');
            expect(receipt).toContain('Thank you! 🙏');
            expect(receipt).not.toContain('Discount');
        });

        it('should generate a receipt with discount lines if discount exists', () => {
            const sale = {
                date: '2026-05-21T10:00:00Z',
                total: 6.75,
                subtotal: 7.5,
                discount_amount: 0.75,
                discount_type: 'percent',
                discount_value: 10,
                payment_method: 'UPI'
            };

            const receipt = generateReceipt(sale, items, settings);

            expect(receipt).toContain('Subtotal: $7.50');
            expect(receipt).toContain('Discount (10%): -$0.75');
            expect(receipt).toContain('*Total: $6.75*');
        });

        it('should handle flat discount types correctly', () => {
            const sale = {
                date: '2026-05-21T10:00:00Z',
                total: 6.5,
                subtotal: 7.5,
                discount_amount: 1.0,
                discount_type: 'flat',
                discount_value: 1.0,
                payment_method: 'Card'
            };

            const receipt = generateReceipt(sale, items, settings);

            expect(receipt).toContain('Discount ($1.00): -$1.00');
        });
    });

    describe('shareOnWhatsApp', () => {
        let originalOpen;

        beforeEach(() => {
            originalOpen = window.open;
            window.open = vi.fn();
        });

        afterEach(() => {
            window.open = originalOpen;
        });

        it('should call window.open with a formatted WhatsApp link', () => {
            shareOnWhatsApp('+1 (555) 123-4567', 'Hello World!');

            expect(window.open).toHaveBeenCalledWith(
                'https://wa.me/15551234567?text=Hello%20World!',
                '_blank'
            );
        });
    });
});
