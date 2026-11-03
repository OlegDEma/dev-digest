/* useDialogKeys — Escape handling and a Tab focus trap for the topmost
   `role="dialog"` on the page (the kit Modal offers neither). */
"use client";

import React from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Move focus into the topmost dialog: its `[data-autofocus]` element, else its first focusable one. */
export function focusTopDialog() {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  const top = dialogs[dialogs.length - 1];
  if (!top) return;
  (top.querySelector<HTMLElement>("[data-autofocus]") ?? top.querySelector<HTMLElement>(FOCUSABLE))?.focus();
}

/** Remember the element focused when the component mounts and give it focus back on unmount. */
export function useRestoreFocus() {
  // Captured during render: child effects (the dialog's autofocus) run before this component's effects.
  const [opener] = React.useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  React.useEffect(
    () => () => {
      if (opener?.isConnected) opener.focus();
    },
    [opener],
  );
}

export function useDialogKeys(onEscape: () => void, enabled = true) {
  const escapeRef = React.useRef(onEscape);
  escapeRef.current = onEscape;

  React.useEffect(() => {
    if (!enabled) return;
    focusTopDialog();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        escapeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const top = dialogs[dialogs.length - 1];
      if (!top) return;
      const items = [...top.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!top.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}
