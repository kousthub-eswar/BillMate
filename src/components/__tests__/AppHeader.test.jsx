import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect } from 'vitest';
import AppHeader from '../AppHeader';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AppHeader Component', () => {
    it('should render title and respond to online/offline network events', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <AppHeader title="Dashboard">
                    <button id="header-action">Action</button>
                </AppHeader>
            );
        });

        expect(container.innerHTML).toContain('Dashboard');
        expect(container.innerHTML).toContain('BillMate');
        expect(container.querySelector('#header-action')).not.toBeNull();

        // Simulate offline event
        await act(async () => {
            window.dispatchEvent(new Event('offline'));
        });

        expect(container.innerHTML).toContain('Offline');

        // Simulate online event
        await act(async () => {
            window.dispatchEvent(new Event('online'));
        });

        expect(container.innerHTML).toContain('Online');

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
