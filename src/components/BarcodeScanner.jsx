import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

export default function BarcodeScanner({ onScan, onClose }) {
    const scannerRef = useRef(null);

    useEffect(() => {
        // Initialize scanner
        const scanner = new Html5QrcodeScanner(
            "reader",
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            },
      /* verbose= */ false
        );

        scanner.render(
            (decodedText) => {
                onScan(decodedText);
                // Stop scanning after success
                scanner.clear();
            },
            () => {
                // ignore errors during scanning
            }
        );

        scannerRef.current = scanner;

        // Cleanup
        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(error => {
                    console.error("Failed to clear html5-qrcode scanner. ", error);
                });
            }
        };
    }, [onScan]);

    return (
        <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <div className="modal-content" style={{ padding: 0, overflow: 'hidden', background: '#000' }}>
                <div style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                    <span style={{ fontWeight: 600 }}>Scan Barcode</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)' }}>
                        <X size={24} />
                    </button>
                </div>
                <div id="reader" style={{ width: '100%', minHeight: '300px' }}></div>
                <div style={{ padding: 20, textAlign: 'center', color: '#fff', fontSize: '0.9rem' }}>
                    Point camera at barcode
                </div>
            </div>
        </div>
    );
}
