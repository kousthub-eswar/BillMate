import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider, useToast } from '../Toast';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TestComponent = ({ onTrigger }) => {
    const showToast = useToast();
    return (
        <button
            id="toast-trigger"
            onClick={() => {
                showToast('Action successful!', 'success');
                if (onTrigger) onTrigger();
            }}
        >
            Trigger Toast
        </button>
    );
};

const TestErrorComponent = () => {
    const showToast = useToast();
    return (
        <button
            id="toast-error-trigger"
            onClick={() => showToast('Action failed!', 'error')}
        >
            Trigger Error Toast
        </button>
    );
};

describe('Toast Component', () => {
    it('should display success toast when triggered and auto-dismiss after timer', async () => {
        vi.useFakeTimers();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ToastProvider>
                    <TestComponent />
                </ToastProvider>
            );
        });

        const button = container.querySelector('#toast-trigger');
        expect(button).not.toBeNull();

        await act(async () => {
            button.click();
        });

        expect(container.innerHTML).toContain('Action successful!');
        expect(container.querySelector('.toast.success')).not.toBeNull();

        // Advance timer past 2500ms
        await act(async () => {
            vi.advanceTimersByTime(2600);
        });

        expect(container.querySelector('.toast')).toBeNull();

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
        vi.useRealTimers();
    });

    it('should display error toast with error class', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ToastProvider>
                    <TestErrorComponent />
                </ToastProvider>
            );
        });

        const button = container.querySelector('#toast-error-trigger');
        await act(async () => {
            button.click();
        });

        expect(container.innerHTML).toContain('Action failed!');
        expect(container.querySelector('.toast.error')).not.toBeNull();

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
