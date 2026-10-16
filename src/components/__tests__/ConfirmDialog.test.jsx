import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import ConfirmDialog from '../ConfirmDialog';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ConfirmDialog Component', () => {
    it('should render title, message, and trigger onConfirm and onCancel callbacks', async () => {
        const onConfirmMock = vi.fn();
        const onCancelMock = vi.fn();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ConfirmDialog
                    title="Delete Item"
                    message="Are you sure you want to delete this?"
                    onConfirm={onConfirmMock}
                    onCancel={onCancelMock}
                    confirmText="Delete Now"
                    variant="danger"
                />
            );
        });

        expect(container.innerHTML).toContain('Delete Item');
        expect(container.innerHTML).toContain('Are you sure you want to delete this?');
        expect(container.innerHTML).toContain('Delete Now');

        const confirmBtn = container.querySelector('.btn-danger');
        expect(confirmBtn).not.toBeNull();

        await act(async () => {
            confirmBtn.click();
        });
        expect(onConfirmMock).toHaveBeenCalledTimes(1);

        const cancelBtn = container.querySelector('.btn-secondary');
        expect(cancelBtn).not.toBeNull();

        await act(async () => {
            cancelBtn.click();
        });
        expect(onCancelMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });

    it('should render non-danger variant with btn-primary', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ConfirmDialog
                    title="Complete Action"
                    message="Confirm operation?"
                    onConfirm={() => {}}
                    onCancel={() => {}}
                    variant="info"
                />
            );
        });

        expect(container.querySelector('.btn-primary')).not.toBeNull();
        expect(container.querySelector('.btn-danger')).toBeNull();

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
