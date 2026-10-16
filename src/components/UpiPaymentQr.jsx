import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, ExternalLink, QrCode as QrIcon } from 'lucide-react';

export function generateUpiUri({ vpa, name, amount, note = 'BillMate Payment' }) {
    if (!vpa) return '';
    const cleanVpa = vpa.trim();
    const cleanName = encodeURIComponent(name || 'Merchant');
    const cleanAmount = Number(amount || 0).toFixed(2);
    const cleanNote = encodeURIComponent(note || 'POS Bill');
    return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}`;
}

export default function UpiPaymentQr({
    vpa = 'merchant@upi',
    shopName = 'BillMate',
    amount = 0,
    note = 'Sale Payment',
    currency = '₹',
    onCopySuccess
}) {
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [qrError, setQrError] = useState(false);

    const upiUri = generateUpiUri({ vpa, name: shopName, amount, note });

    useEffect(() => {
        let isMounted = true;
        if (!upiUri) return;

        QRCode.toDataURL(upiUri, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 200,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            }
        })
            .then(url => {
                if (isMounted) {
                    setQrDataUrl(url);
                    setQrError(false);
                }
            })
            .catch(() => {
                if (isMounted) setQrError(true);
            });

        return () => {
            isMounted = false;
        };
    }, [upiUri]);

    const handleCopy = () => {
        if (!vpa) return;
        navigator.clipboard?.writeText(vpa);
        setCopied(true);
        if (onCopySuccess) onCopySuccess();
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{
            margin: '0 0 20px 0',
            padding: '16px',
            background: 'var(--bg-secondary)',
            borderRadius: 16,
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12
        }}>
            {/* Header with Amount */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                paddingBottom: 8,
                borderBottom: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <QrIcon size={16} color="var(--primary-400)" />
                    <span style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Instant UPI Payment
                    </span>
                </div>
                <span style={{
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    color: 'var(--accent-400)'
                }}>
                    {currency}{Number(amount).toFixed(2)}
                </span>
            </div>

            {/* Offline Local QR Image */}
            <div style={{
                background: '#ffffff',
                padding: 10,
                borderRadius: 14,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 160,
                minHeight: 160
            }}>
                {qrDataUrl && !qrError ? (
                    <img
                        src={qrDataUrl}
                        alt="UPI Payment QR Code"
                        style={{
                            width: 160,
                            height: 160,
                            display: 'block',
                            borderRadius: 6
                        }}
                    />
                ) : (
                    <div style={{
                        width: 160,
                        height: 160,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        color: '#64748b'
                    }}>
                        Generating QR...
                    </div>
                )}
            </div>

            {/* App Support Badges */}
            <div style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 600,
                color: 'var(--text-muted)'
            }}>
                <span style={{ background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}>Google Pay</span>
                <span style={{ background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}>PhonePe</span>
                <span style={{ background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}>Paytm</span>
                <span style={{ background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}>BHIM</span>
            </div>

            {/* VPA and Copy / Open Buttons */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                width: '100%',
                background: 'var(--bg-card)',
                padding: '6px 12px',
                borderRadius: 10,
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        UPI VPA
                    </div>
                    <div style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {vpa || 'merchant@upi'}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                    <button
                        type="button"
                        onClick={handleCopy}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                            background: copied ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-secondary)',
                            color: copied ? 'var(--accent-400)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }}
                        title="Copy VPA"
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>

                    <a
                        href={upiUri}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: 'var(--primary-400)',
                            textDecoration: 'none',
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }}
                        title="Open UPI Intent"
                    >
                        <ExternalLink size={12} />
                        Pay App
                    </a>
                </div>
            </div>
        </div>
    );
}
