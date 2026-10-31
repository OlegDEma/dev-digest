/* DiffTab — the case's unified diff: a textarea plus a read-only preview that
   highlights `+` lines and `@@` hunk headers. Every line keeps its prefix as
   text. The preview follows a deferred copy of the diff so typing stays
   responsive on a 256 KB paste. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@devdigest/ui";
import { s } from "./styles";

function lineKind(line: string): "add" | "hunk" | "plain" {
  if (line.startsWith("@@")) return "hunk";
  return line.startsWith("+") && !line.startsWith("+++") ? "add" : "plain";
}

export function DiffTab({
  diff,
  onChange,
  problem,
}: {
  diff: string;
  onChange: (v: string) => void;
  /** Reason-specific or limit message for this tab; null when fine. */
  problem: string | null;
}) {
  const t = useTranslations("eval");
  const deferred = React.useDeferredValue(diff);
  const lines = React.useMemo(() => deferred.split("\n"), [deferred]);

  return (
    <div>
      <label>
        <span style={s.srOnly}>{t("caseEditor.tabs.diff")}</span>
        <Textarea mono rows={10} value={diff} onChange={onChange} placeholder={t("caseEditor.diffPlaceholder")} />
      </label>
      {problem && (
        <div role="alert" style={s.error}>
          {problem}
        </div>
      )}
      {diff && (
        <>
          <div style={s.label}>{t("caseEditor.preview")}</div>
          <pre style={s.preview} data-testid="diff-preview" aria-label={t("caseEditor.preview")}>
            {lines.map((line, i) => (
              <div key={i} data-line={lineKind(line)} style={s.line(lineKind(line))}>
                {line || " "}
              </div>
            ))}
          </pre>
        </>
      )}
    </div>
  );
}
