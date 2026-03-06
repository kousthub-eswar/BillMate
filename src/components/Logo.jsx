import React from 'react';
import { ShoppingCart } from 'lucide-react';

export default function Logo({ size = 72, iconSize = 40, borderRadius = 20, style = {} }) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-400))',
            width: size, height: size, borderRadius: borderRadius,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 16px rgba(245, 166, 35, 0.25)',
            flexShrink: 0,
            ...style
        }}>
            <ShoppingCart size={iconSize} color="white" />
        </div>
    );
}
