/* ResultStrip — the saved case's last result inside the editor: passed / failed
   / errored / never run, "Running…" while a run of the case is in flight, and
   "edited since last run" once the content moved past the scored revision. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCase } from "@devdigest/shared";
import { formatCost } from "@/lib/eval-format";
import { s } from "./styles";

export function ResultStrip({
  running,
  runError,
  case: c,
}: {
  running: boolean;
  /** Why the last attempt to start a run was rejected. */
  runError: string | null;
  case: EvalCase | null;
}) {
  const t = useTranslations("eval");
  const r = c?.last_result ?? null;
  const edited = !!c && !!r && r.case_revision < c.revision;

  let text: string;
  let failed = false;
  if (running) {
    text = t("caseEditor.strip.running");
  } else if (runError) {
    text = t("caseEditor.strip.runFailed", { message: runError });
    failed = true;
  } else if (!r) {
    text = t("caseEditor.strip.never");
  } else if (r.status === "error") {
    text = t("caseEditor.strip.errored", { message: r.summary });
    failed = true;
  } else {
    text = t(r.status === "pass" ? "caseEditor.strip.passed" : "caseEditor.strip.failed", {
      summary: r.summary,
      duration: r.duration_ms == null ? "—" : `${(r.duration_ms / 1000).toFixed(1)}s`,
      cost: formatCost(r.cost_usd),
    });
  }

  return (
    <div style={s.strip} role={failed ? "alert" : "status"} data-testid="result-strip">
      <span style={{ ...s.text, ...(failed ? s.error : null) }} title={text}>
        {text}
      </span>
      {!running && edited && <span style={s.edited}>{t("caseEditor.strip.edited")}</span>}
    </div>
  );
}
