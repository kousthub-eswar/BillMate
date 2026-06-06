import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import ErrorBoundary from '../ErrorBoundary';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A component that throws an error during rendering
const CrashingComponent = ({ shouldCrash }) => {
  if (shouldCrash) {
    throw new Error('Test crash error message');
  }
  return <div>Normal Child Component</div>;
};

describe('ErrorBoundary Component', () => {
  it('renders children normally when no error occurs', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <CrashingComponent shouldCrash={false} />
        </ErrorBoundary>
      );
    });

    expect(container.innerHTML).toContain('Normal Child Component');
    expect(container.innerHTML).not.toContain('Something went wrong');

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('catches render errors and displays fallback UI', async () => {
    // Silence expected console error logs from React error boundary catching
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ErrorBoundary>
          <CrashingComponent shouldCrash={true} />
        </ErrorBoundary>
      );
    });

    expect(container.innerHTML).toContain('Something went wrong');
    expect(container.innerHTML).toContain('Test crash error message');

    consoleErrorSpy.mockRestore();

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
