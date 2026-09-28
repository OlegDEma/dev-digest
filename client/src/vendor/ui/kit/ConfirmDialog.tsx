import React from "react";
import { Modal } from "./Modal";
import { Button } from "../primitives";

/**
 * Confirmation for a destructive action. Replaces `window.confirm`, which is
 * unstyled, unlocalisable, blocks the main thread and cannot show a loading
 * state while the delete is in flight.
 *
 * Dismissing — the ✕, the backdrop or Cancel — is always the safe outcome.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      width={440}
      title={title}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button kind="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button kind="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>{body}</p>
      )}
    </Modal>
  );
}
