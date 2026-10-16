import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import Logo from '../Logo';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Logo Component', () => {
    it('should render with default props', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<Logo />);
        });

        const logoDiv = container.querySelector('div');
        expect(logoDiv).not.toBeNull();
        expect(logoDiv.style.width).toBe('72px');
        expect(logoDiv.style.height).toBe('72px');

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });

    it('should render with custom size, borderRadius, and custom styles', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <Logo size={48} iconSize={24} borderRadius={12} style={{ opacity: 0.8 }} />
            );
        });

        const logoDiv = container.querySelector('div');
        expect(logoDiv).not.toBeNull();
        expect(logoDiv.style.width).toBe('48px');
        expect(logoDiv.style.height).toBe('48px');
        expect(logoDiv.style.opacity).toBe('0.8');

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
