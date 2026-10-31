/* ExpectedOutput — the expected findings as JSON (`[]` = the agent must stay
   silent), with a valid/invalid badge carrying the first error's JSON path, the
   "+ Finding skeleton" shortcut and the "can never match" warnings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Textarea } from "@devdigest/ui";
import type { EvalExpectedItem } from "@devdigest/shared";
import { lineLabel, type ExpectedCheck } from "../../helpers";
import { s } from "./styles";

export function ExpectedOutput({
  text,
  check,
  neverMatch,
  canSkeleton,
  onChange,
  onSkeleton,
}: {
  text: string;
  check: ExpectedCheck;
  /** 0-based indexes of items no finding on the diff could match. */
  neverMatch: number[];
  canSkeleton: boolean;
  onChange: (v: string) => void;
  onSkeleton: () => void;
}) {
  const t = useTranslations("eval");
  const items: EvalExpectedItem[] = check.ok ? check.items : [];

  return (
    <div>
      <div style={s.head}>
        <span style={s.label}>{t("caseEditor.expectedOutput")}</span>
        <span style={s.badge(check.ok)} data-testid="json-badge">
          {check.ok ? t("caseEditor.validJson") : t("caseEditor.invalidJsonAt", { path: check.path })}
        </span>
        <span style={s.spacer} />
        <Button kind="ghost" size="sm" disabled={!canSkeleton} onClick={onSkeleton}>
          {t("caseEditor.skeleton")}
        </Button>
      </div>
      <label>
        <span style={s.srOnly}>{t("caseEditor.expectedOutput")}</span>
        <Textarea mono rows={9} value={text} onChange={onChange} />
      </label>
      {!check.ok && <div style={s.detail}>{check.message}</div>}
      {neverMatch.map((i) => {
        const item = items[i];
        if (!item) return null;
        return (
          <div key={i} role="status" style={s.warn}>
            {t("caseEditor.neverMatch", { n: i + 1, location: `${item.file}:${lineLabel(item)}` })}
          </div>
        );
      })}
    </div>
  );
}
