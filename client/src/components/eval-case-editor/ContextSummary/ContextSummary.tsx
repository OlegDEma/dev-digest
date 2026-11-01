/* ContextSummary — one-line report of what a finding-derived eval case pulled
   from its PR (files, PR meta, skipped / unavailable files) plus a toggle that
   lists the skipped files with their reason. Skipped paths come from the PR and
   are untrusted: rendered as text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseContextReport } from "@devdigest/shared";
import { s } from "./styles";

const MAX_LISTED = 20;

const META_KEY = {
  attached: "metaAttached",
  truncated: "metaTruncated",
  empty: "metaEmpty",
} as const;

export function ContextSummary({ report }: { report: EvalCaseContextReport }) {
  const t = useTranslations("eval.caseContext");
  const [open, setOpen] = React.useState(false);
  const skipped = report.files_skipped;
  const listId = React.useId();

  const text =
    t("summary", { n: report.files_included, meta: t(META_KEY[report.pr_meta]) }) +
    (skipped.length > 0 ? t("skipped", { k: skipped.length }) : "") +
    (report.files_unavailable > 0 ? t("unavailable", { u: report.files_unavailable }) : "");

  return (
    <div style={s.root}>
      <span>{text}</span>
      {skipped.length > 0 && (
        <>
          <button
            type="button"
            style={s.toggle}
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
          >
            {t("showSkipped")}
          </button>
          {open && (
            <ul id={listId} style={s.list}>
              {skipped.slice(0, MAX_LISTED).map((f, i) => (
                <li key={`${i}-${f.path}`}>
                  {f.path} — {t(`reason.${f.reason}`)}
                </li>
              ))}
              {skipped.length > MAX_LISTED && <li>{t("more", { n: skipped.length - MAX_LISTED })}</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default ContextSummary;
