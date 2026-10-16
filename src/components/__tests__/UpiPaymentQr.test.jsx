import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import UpiPaymentQr, { generateUpiUri } from '../UpiPaymentQr';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('UpiPaymentQr Component & Helper', () => {
    describe('generateUpiUri', () => {
        it('should format valid NPCI UPI URI with encoded parameters', () => {
            const uri = generateUpiUri({
                vpa: 'shop@okhdfcbank',
                name: 'Grocery Mart & Co',
                amount: 250.5,
                note: 'Invoice 101'
            });

            expect(uri).toContain('upi://pay?');
            expect(uri).toContain('pa=shop@okhdfcbank');
            expect(uri).toContain('pn=Grocery%20Mart%20%26%20Co');
            expect(uri).toContain('am=250.50');
            expect(uri).toContain('cu=INR');
            expect(uri).toContain('tn=Invoice%20101');
        });

        it('should return empty string if vpa is not provided', () => {
            expect(generateUpiUri({ vpa: '' })).toBe('');
            expect(generateUpiUri({})).toBe('');
        });
    });

    describe('UpiPaymentQr UI Rendering', () => {
        it('should render amount, UPI badges, and copy VPA on button click', async () => {
            const onCopyMock = vi.fn();
            Object.assign(navigator, {
                clipboard: {
                    writeText: vi.fn().mockResolvedValue()
                }
            });

            const container = document.createElement('div');
            document.body.appendChild(container);
            const root = createRoot(container);

            await act(async () => {
                root.render(
                    <UpiPaymentQr
                        vpa="merchant@paytm"
                        shopName="Smart Store"
                        amount={499.75}
                        onCopySuccess={onCopyMock}
                    />
                );
            });

            // Check rendered content
            expect(container.innerHTML).toContain('₹499.75');
            expect(container.innerHTML).toContain('merchant@paytm');
            expect(container.innerHTML).toContain('Google Pay');
            expect(container.innerHTML).toContain('PhonePe');
            expect(container.innerHTML).toContain('Paytm');
            expect(container.innerHTML).toContain('BHIM');

            // Find copy button and click
            const copyBtn = container.querySelector('button');
            expect(copyBtn).not.toBeNull();

            await act(async () => {
                copyBtn.click();
            });

            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('merchant@paytm');
            expect(onCopyMock).toHaveBeenCalled();

            // Find pay app link
            const payLink = container.querySelector('a');
            expect(payLink).not.toBeNull();
            expect(payLink.getAttribute('href')).toContain('upi://pay?pa=merchant@paytm');

            await act(async () => {
                root.unmount();
            });
            document.body.removeChild(container);
        });
    });
});
