import React, { useState, useEffect } from 'react';
import Logo from './Logo';

export default function AppHeader({ title, children }) {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Logo size={36} iconSize={20} borderRadius={10} />
                <div style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--primary-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            BillMate POS
                        </div>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.58rem',
                            fontWeight: 700,
                            color: isOnline ? 'var(--accent-400)' : 'var(--danger-400)',
                            background: isOnline ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            border: isOnline ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                        }}>
                            <span style={{
                                width: 4,
                                height: 4,
                                borderRadius: '50%',
                                background: isOnline ? 'var(--accent-400)' : 'var(--danger-400)'
                            }} />
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    <h1 style={{ fontSize: '1.4rem', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {title}
                    </h1>
                </div>
            </div>
            {children && <div style={{ flexShrink: 0, marginLeft: 12 }}>{children}</div>}
        </div>
    );
}
