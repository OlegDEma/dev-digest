/* BlastRadiusCard — what else in the repo a PR can break: changed symbols, their direct
   callers, and the endpoints/crons behind them. Tree and Graph views over one response. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlast } from "../../../../../../../../../lib/hooks/blast";
import { useResyncRepoIntel } from "../../../../../../../../../lib/hooks/repo-intel";
import { notify } from "../../../../../../../../../lib/toast";
import { callerHref, linkSha, statItems } from "./helpers";
import { SymbolGroup } from "./_components/SymbolGroup";
import { BlastGraph } from "./_components/BlastGraph";
import { SegmentedToggle } from "./_components/SegmentedToggle";
import { PriorPrs } from "./_components/PriorPrs";
import { SYMBOL_ROWS, s } from "./styles";

interface BlastRadiusCardProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}

export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const tb = useTranslations("brief");
  const t = useTranslations("blast");
  const q = usePrBlast(prId);
  const resync = useResyncRepoIntel(repoId);
  const qc = useQueryClient();
  const [view, setView] = React.useState<"tree" | "graph">("tree");
  const [showAll, setShowAll] = React.useState(false);

  const label = (
    <div style={s.title}>
      <SectionLabel icon="Workflow">{tb("block.blast")}</SectionLabel>
    </div>
  );

  if (q.isLoading) {
    return (
      <section>
        <div style={s.card}>
          {label}
          <Skeleton height={72} />
        </div>
      </section>
    );
  }
  if (q.isError || !q.data) {
    return (
      <section>
        <div style={s.card}>
          {label}
          <ErrorState body={(q.error as Error | null)?.message ?? ""} onRetry={() => q.refetch()} />
        </div>
      </section>
    );
  }

  const data = q.data;
  const sha = linkSha(data, headSha);
  const hrefFor = (file: string, line: number) => callerHref(repoFullName, sha, file, line);
  const runResync = () =>
    resync.mutate(undefined, {
      onSuccess: () => {
        notify.success(t("resync.started"));
        qc.invalidateQueries({ queryKey: ["pull-blast", prId] });
      },
      onError: () => notify.error(t("resync.failed")),
    });

  const noSymbols = data.changed_symbols.length === 0;
  const rows = showAll ? data.downstream : data.downstream.slice(0, SYMBOL_ROWS);

  return (
    <section>
      <div style={s.card}>
        {label}
        <div style={s.headerRow}>
          <div style={s.stats}>
            {statItems(data.counts).map((it) => {
              const I = Icon[it.icon];
              return (
                <span key={it.key} style={s.stat}>
                  <I size={12} />
                  <span style={s.statValue}>{it.value}</span> {t(`stat.${it.key}`, { count: it.value })}
                </span>
              );
            })}
          </div>
          {data.downstream.length > 0 && (
            <div style={s.toggleSlot}>
              <SegmentedToggle
                ariaLabel={t("view.label")}
                value={view}
                onChange={setView}
                options={[
                  { value: "tree", label: t("view.tree") },
                  { value: "graph", label: t("view.graph") },
                ]}
              />
            </div>
          )}
        </div>
        <div style={s.hint}>{t("scope", { max: data.max_callers_per_symbol })}</div>

        {data.degraded && data.reason && (
          <div style={s.degradedRow}>
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              {t("degraded.label")} — {t(`degraded.reason.${data.reason}`)}
            </Badge>
            <Button size="sm" onClick={runResync} disabled={resync.isPending} loading={resync.isPending}>
              {t("resync.action")}
            </Button>
          </div>
        )}

        {noSymbols ? (
          <span style={s.muted}>{data.degraded ? t("degraded.empty") : t("noSymbols")}</span>
        ) : (
          <>
            {data.counts.callers === 0 && <span style={s.muted}>{t("noDownstream", { count: data.counts.symbols })}</span>}
            {view === "tree" ? (
              <div style={s.list}>
                {rows.map((g, i) => (
                  <SymbolGroup
                    key={g.symbol}
                    group={g}
                    cap={data.max_callers_per_symbol}
                    defaultOpen={i === 0 && g.callers.length > 0}
                    hrefFor={hrefFor}
                  />
                ))}
                {data.downstream.length > SYMBOL_ROWS && !showAll && (
                  <div>
                    <Button size="sm" onClick={() => setShowAll(true)}>
                      {t("showAll", { count: data.downstream.length })}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <BlastGraph
                downstream={data.downstream}
                factsByFile={data.facts_by_file}
                cap={data.max_callers_per_symbol}
                hrefFor={hrefFor}
              />
            )}
          </>
        )}

        <PriorPrs prId={prId} repoFullName={repoFullName} enabled={q.isSuccess} />
      </div>
    </section>
  );
}
