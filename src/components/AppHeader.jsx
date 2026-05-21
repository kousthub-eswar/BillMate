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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <Logo size={34} iconSize={18} borderRadius={10} />
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--primary-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                            BillMate
                        </div>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: '0.55rem',
                            fontWeight: 700,
                            color: isOnline ? 'var(--accent-400)' : 'var(--danger-400)',
                            background: isOnline ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                            padding: '1px 5px',
                            borderRadius: 4,
                            border: isOnline ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                            flexShrink: 0
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
                    <h1 style={{ fontSize: '1.3rem', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {title}
                    </h1>
                </div>
            </div>
            {children && <div style={{ flexShrink: 0 }}>{children}</div>}
        </div>
    );
}
