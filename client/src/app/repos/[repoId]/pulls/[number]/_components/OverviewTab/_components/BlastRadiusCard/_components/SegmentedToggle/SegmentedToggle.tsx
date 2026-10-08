/* SegmentedToggle — one shared track with a filled active segment (Tree | Graph). */
"use client";

import React from "react";
import { s } from "./styles";

interface SegmentedToggleProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function SegmentedToggle<T extends string>({ options, value, onChange, ariaLabel }: SegmentedToggleProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} style={s.track}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          style={s.segment(o.value === value)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
