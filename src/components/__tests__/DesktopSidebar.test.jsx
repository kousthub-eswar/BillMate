import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import DesktopSidebar from '../DesktopSidebar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DesktopSidebar Component', () => {
    it('should render brand, links, status, and handle navigation and logout callbacks', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const onNavigate = vi.fn();
        const onLogout = vi.fn();
        const onToggleCollapse = vi.fn();

        await act(async () => {
            root.render(
                <DesktopSidebar
                    activePage="billing"
                    onNavigate={onNavigate}
                    onLogout={onLogout}
                    collapsed={false}
                    onToggleCollapse={onToggleCollapse}
                />
            );
        });

        expect(container.innerHTML).toContain('BillMate');
        expect(container.innerHTML).toContain('Billing Terminal');
        expect(container.innerHTML).toContain('Dashboard');
        expect(container.innerHTML).toContain('Products &amp; Stock');
        expect(container.innerHTML).toContain('Sales History');

        // Test clicking a nav link
        const dashBtn = container.querySelector('#sidebar-nav-dashboard');
        expect(dashBtn).not.toBeNull();
        await act(async () => {
            dashBtn.click();
        });
        expect(onNavigate).toHaveBeenCalledWith('dashboard');

        // Test clicking logout
        const logoutBtn = container.querySelector('#sidebar-logout-btn');
        expect(logoutBtn).not.toBeNull();
        await act(async () => {
            logoutBtn.click();
        });
        expect(onLogout).toHaveBeenCalled();

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});

