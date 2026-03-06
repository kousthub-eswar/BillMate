import React, { useEffect, useState } from 'react';
import Logo from './Logo';

export default function SplashScreen({ onComplete }) {
    const [opacity, setOpacity] = useState(1);

    const [pointerNone, setPointerNone] = useState(false);

    useEffect(() => {
        // Fade out and unmount after 1.5 seconds total
        const timer1 = setTimeout(() => {
            setOpacity(0);
            setPointerNone(true);
        }, 1200);
        const timer2 = setTimeout(() => onComplete(), 1500);
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, [onComplete]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-primary)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            opacity: opacity, transition: 'opacity 300ms ease-out', pointerEvents: pointerNone ? 'none' : 'auto'
        }}>
            <div style={{ animation: 'scaleIn 0.5s ease-out', marginBottom: 20 }}>
                <Logo size={72} iconSize={40} borderRadius={20} />
            </div>
            <h1 style={{
                fontSize: '2rem', fontWeight: 900, margin: 0,
                background: 'linear-gradient(135deg, var(--text-primary), var(--text-secondary))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.03em'
            }}>BillMate</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 8, fontWeight: 500 }}>
                Loading your shop...
            </p>
        </div>
    );
}
