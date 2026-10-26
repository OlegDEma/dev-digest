/* FileRows — shared rows of Critical paths and the Guided reading path:
   plain-text middle-truncated path, description / reason, rank and an "Open"
   link whose accessible name carries the full path. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingCriticalPathItem, OnboardingReadingPathItem } from "@devdigest/shared";
import { PATH_TRUNCATE_AT } from "../../constants";
import { middleTruncate, openFileUrl, topPercent } from "../../helpers";
import { s } from "./styles";

type Row =
  | { kind: "critical"; item: OnboardingCriticalPathItem }
  | { kind: "reading"; item: OnboardingReadingPathItem };

export function FileRows({
  rows,
  repoFullName,
  sha,
  defaultBranch,
  rankedByImportGraph,
}: {
  rows: Row[];
  repoFullName: string;
  sha: string | null;
  defaultBranch: string | null | undefined;
  /** Shows the "Ranked by import graph" note (reading path while hotness is unavailable). */
  rankedByImportGraph?: boolean;
}) {
  const t = useTranslations("onboarding");

  return (
    <div>
      {rankedByImportGraph && <p style={s.note}>{t("files.rankedByImportGraph")}</p>}
      {rows.length === 0 ? (
        <p style={s.empty}>{t("files.none")}</p>
      ) : (
        <ul style={s.list}>
          {rows.map((row) => {
            const { path } = row.item;
            const text = row.kind === "critical" ? row.item.description : row.item.reason;
            return (
              <li key={path} style={s.row}>
                {row.kind === "reading" && <span style={s.order}>{row.item.order}</span>}
                <div style={s.main}>
                  <div className="mono" style={s.path}>
                    {middleTruncate(path, PATH_TRUNCATE_AT)}
                  </div>
                  <p style={s.text}>{text}</p>
                </div>
                {row.kind === "reading" && (
                  <span style={s.meta}>{t("files.top", { percent: topPercent(row.item.rank_percentile) })}</span>
                )}
                <a
                  href={openFileUrl(repoFullName, sha, defaultBranch, path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("files.openLabel", { path })}
                  style={s.link}
                >
                  {t("files.open")}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
