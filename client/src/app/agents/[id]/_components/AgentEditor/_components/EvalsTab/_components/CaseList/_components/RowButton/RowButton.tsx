/* RowButton — a 28px icon button with an accessible name and a real `disabled`
   (the kit IconBtn has none, and the run button must disable while a run is active). */
"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";

export function RowButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const I = Icon[icon];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        display: "inline-grid",
        placeItems: "center",
        borderRadius: 6,
        border: "1px solid transparent",
        background: "transparent",
        color: "var(--text-secondary)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <I size={15} />
    </button>
  );
}
