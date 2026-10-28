/* RunCommands — numbered, copyable run commands with muted single-line
   annotations, the "no package.json" text, and the skipped-files list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingRunCommandItem, OnboardingSkippedFile } from "@devdigest/shared";
import { sanitizeAnnotation } from "../../helpers";
import { s } from "./styles";

export function RunCommands({
  items,
  skipped,
}: {
  items: OnboardingRunCommandItem[];
  skipped: OnboardingSkippedFile[];
}) {
  const t = useTranslations("onboarding");
  const [copiedOrder, setCopiedOrder] = React.useState<number | null>(null);

  const copy = async (item: OnboardingRunCommandItem) => {
    try {
      await navigator.clipboard.writeText(item.command);
      setCopiedOrder(item.order);
      window.setTimeout(() => setCopiedOrder((o) => (o === item.order ? null : o)), 2000);
    } catch {
      /* clipboard unavailable — nothing to confirm */
    }
  };

  return (
    <div>
      {items.length === 0 ? (
        <p style={s.empty}>{t("run.noManifest")}</p>
      ) : (
        <ol style={s.list}>
          {[...items]
            .sort((a, b) => a.order - b.order)
            .map((item) => {
              const note = item.annotation ? sanitizeAnnotation(item.annotation) : "";
              return (
                <li key={item.order} style={s.row}>
                  <span style={s.order}>{item.order}</span>
                  <div style={s.codeWrap}>
                    <code className="mono" style={s.code}>
                      {item.command}
                    </code>
                  </div>
                  {note && <span style={s.annotation}>{note}</span>}
                  <Button
                    kind="ghost"
                    size="sm"
                    icon="Copy"
                    aria-label={t("run.copyLabel", { command: item.command })}
                    onClick={() => void copy(item)}
                  >
                    {copiedOrder === item.order ? t("run.copied") : t("run.copy")}
                  </Button>
                </li>
              );
            })}
        </ol>
      )}
      {skipped.length > 0 && (
        <div style={s.skipped}>
          <p style={s.skippedTitle}>{t("run.skippedFiles")}</p>
          <ul style={s.skippedList}>
            {skipped.map((f) => (
              <li key={f.path}>
                <span className="mono">{f.path}</span> — {t(`run.skipReasons.${f.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
