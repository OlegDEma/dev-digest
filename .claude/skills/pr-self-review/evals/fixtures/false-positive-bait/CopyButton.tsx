// FIXTURE (eval id 4, precision) — looks risky, is actually fine.
// Expected gate verdict: PASS (at most a SUGGESTION). NOT part of the app build.
//
// Bait 1: an icon-only <button> that DOES have an aria-label — but on the line
//         AFTER `<button`, which a naive line-local check misreads as "missing".
// Bait 2: a fetch() whose URL comes from build-time config (server-controlled),
//         NOT from user input — so it is not SSRF.
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    // config-derived URL, not user-controlled — safe
    void fetch(`${API_BASE}/telemetry/copy`, { method: "POST" });
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={onCopy}
    >
      {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
    </button>
  );
}
