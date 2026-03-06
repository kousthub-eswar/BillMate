import React from 'react';
import Logo from './Logo';

export default function AppHeader({ title, children }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Logo size={36} iconSize={20} borderRadius={10} />
                <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--primary-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                        BillMate POS
                    </div>
                    <h1 style={{ fontSize: '1.4rem', margin: 0, lineHeight: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {title}
                    </h1>
                </div>
            </div>
            {children && <div style={{ flexShrink: 0, marginLeft: 12 }}>{children}</div>}
        </div>
    );
}
