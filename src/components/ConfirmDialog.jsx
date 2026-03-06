import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({ title, message, onConfirm, onCancel, confirmText = 'Confirm', variant = 'danger' }) {
    const isDanger = variant === 'danger';

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 320, textAlign: 'center', padding: '24px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-10px -10px 0 0' }}>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{
                    width: 56, height: 56, borderRadius: '50%', background: isDanger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                }}>
                    <AlertTriangle size={32} style={{ color: isDanger ? 'var(--danger-500)' : 'var(--accent-500)' }} />
                </div>

                <h3 style={{ fontSize: '1.2rem', marginBottom: 8, fontWeight: 700 }}>{title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
                    {message}
                </p>

                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>
                        Cancel
                    </button>
                    <button className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1 }} onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
