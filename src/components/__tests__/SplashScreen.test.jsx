import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import SplashScreen from '../SplashScreen';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SplashScreen Component', () => {
    it('should render splash screen and call onComplete callback after timer', async () => {
        vi.useFakeTimers();
        const onCompleteMock = vi.fn();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<SplashScreen onComplete={onCompleteMock} />);
        });

        expect(container.innerHTML).toContain('BillMate');
        expect(container.innerHTML).toContain('Loading your shop...');
        expect(onCompleteMock).not.toHaveBeenCalled();

        // Advance 1200ms - opacity changes
        await act(async () => {
            vi.advanceTimersByTime(1200);
        });

        // Advance remaining 300ms (1500ms total)
        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        expect(onCompleteMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
        vi.useRealTimers();
    });
});
