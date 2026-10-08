/* PriorPrs — collapsed footer of the Blast radius card: earlier merged PRs that touched the same files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink, Skeleton } from "@devdigest/ui";
import { usePrHistory } from "../../../../../../../../../../../lib/hooks/history";
import { githubPrUrl } from "../../../../../../../../../../../lib/github-urls";
import { s } from "./styles";

interface PriorPrsProps {
  prId: string;
  repoFullName: string | null;
  enabled: boolean;
}

export function PriorPrs({ prId, repoFullName, enabled }: PriorPrsProps) {
  const t = useTranslations("blast");
  const q = usePrHistory(prId, { enabled });
  const [open, setOpen] = React.useState(false);

  const unavailable = q.isError || (q.data !== undefined && !q.data.available);
  const items = q.data?.history ?? [];

  return (
    <div style={s.wrap}>
      <button type="button" style={s.header} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon.History size={14} />
        <span>{t("history.title")}</span>
        {!unavailable && q.data && <Badge>{items.length}</Badge>}
        <span style={s.spacer} />
        <Icon.ChevronDown size={14} style={s.chevron(open)} />
      </button>
      {open && (
        <>
          {q.isLoading && <Skeleton height={36} />}
          {unavailable && <span style={s.muted}>{t("history.unavailable")}</span>}
          {!unavailable && q.data && items.length === 0 && <span style={s.muted}>{t("history.empty")}</span>}
          {!unavailable && items.length > 0 && (
            <div style={s.list}>
              {items.map((it) => {
                const href = repoFullName ? githubPrUrl(repoFullName, it.pr_number) : null;
                const label = `#${it.pr_number} ${it.title}`;
                return (
                  <div key={it.pr_number} style={s.row}>
                    {href ? <MonoLink href={href}>{label}</MonoLink> : <span className="mono">{label}</span>}
                    <span style={s.meta} title={it.files_overlap.join("\n")}>
                      {it.author} · {new Date(it.merged_at).toLocaleDateString()} ·{" "}
                      {t("history.overlap", { count: it.files_overlap.length })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
