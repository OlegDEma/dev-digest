/* /repos/:repoId/conventions — the Conventions board (Skills Lab).
   Scan the cloned repo for the house rules it already follows, triage the
   candidates, and merge the accepted ones into a skill. The scan is an explicit
   user action because it costs a model call; nothing here runs on mount. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate, ConventionExtractResult, ConventionSkillDraft } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useRepos } from "../../../../lib/hooks/core";
import {
  useConventionSkillDraft,
  useConventions,
  useDeleteConvention,
  useExtractConventions,
  useUpdateConvention,
} from "../../../../lib/hooks/conventions";
import { useToast } from "../../../../lib/toast";
import { ConventionCard } from "./_components/ConventionCard";
import { ConventionsSkillModal } from "./_components/ConventionsSkillModal";
import { FILTERS, type FilterKey } from "./constants";
import { countByStatus, filterCandidates } from "./helpers";
import { s } from "./styles";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const toast = useToast();
  const params = useParams<{ repoId: string }>();
  const repoId = params?.repoId && params.repoId !== "_" ? params.repoId : null;

  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention(repoId);
  const remove = useDeleteConvention(repoId);
  const draftSkill = useConventionSkillDraft();

  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [summary, setSummary] = React.useState<ConventionExtractResult | null>(null);
  const [draft, setDraft] = React.useState<ConventionSkillDraft | null>(null);

  const list: ConventionCandidate[] = candidates ?? [];
  const counts = countByStatus(list);
  const shown = filterCandidates(list, filter);
  const hasResults = list.length > 0;
  const busy = update.isPending || remove.isPending;

  const runScan = () => {
    if (!repoId || extract.isPending) return;
    extract.mutate(repoId, {
      onSuccess: (res) => setSummary(res),
      onError: (e) => toast.error(`${t("page.extractionFailed")}: ${(e as Error).message}`),
    });
  };

  const openSkillModal = () => {
    if (!repoId) return;
    draftSkill.mutate(repoId, {
      onSuccess: (d) => setDraft(d),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (!repoId) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <EmptyState icon="ListChecks" title={t("page.crumbConventions")} body={t("page.noRepo")} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {draft && (
        <ConventionsSkillModal
          draft={draft}
          acceptedCount={counts.accepted}
          repoName={repo?.name ?? t("page.repoFallback")}
          onClose={() => setDraft(null)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repo?.name ?? t("page.repoFallback")}
              </span>
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          {/* Two distinct buttons, not one that renames itself: the first run and
              a re-run are different intents, and a re-run costs another call. */}
          <div style={s.actions}>
            <Button
              kind="primary"
              icon="Play"
              onClick={runScan}
              loading={extract.isPending}
              disabled={hasResults || extract.isPending}
              title={hasResults ? t("page.runScanHint") : undefined}
            >
              {extract.isPending ? t("page.scanning") : t("page.runScan")}
            </Button>
            <Button
              kind="secondary"
              icon="RefreshCw"
              onClick={runScan}
              disabled={!hasResults || extract.isPending}
              title={!hasResults ? t("page.rescanHint") : undefined}
            >
              {t("page.rescan")}
            </Button>
          </div>
        </div>

        {summary && (
          <p style={s.summary}>
            <span>
              {t("page.scanSummary", {
                proposed: summary.proposed,
                ungrounded: summary.dropped_ungrounded,
                duplicate: summary.dropped_duplicate,
                files: summary.sampled_files,
              })}
            </span>
            <span className="mono">
              {t("page.scanCost", {
                model: summary.model,
                cost: (summary.cost_usd ?? 0).toFixed(4),
              })}
            </span>
          </p>
        )}

        {hasResults && (
          <div style={s.toolbar}>
            {FILTERS.map((f) => (
              <Chip key={f} active={filter === f} count={counts[f]} onClick={() => setFilter(f)}>
                {t(`page.filter.${f}`)}
              </Chip>
            ))}
            <span style={s.toolbarSpacer} />
            <span style={s.summary}>{t("page.candidateCount", { count: list.length })}</span>
            {/* Appears only once something is accepted — there is nothing to
                build a skill out of before that. */}
            {counts.accepted > 0 && (
              <Button
                kind="primary"
                icon="Sparkles"
                onClick={openSkillModal}
                loading={draftSkill.isPending}
              >
                {t("page.createSkill")}
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div style={s.skeleton}>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />
        ) : !hasResults ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runScan}
            ctaLoading={extract.isPending}
          />
        ) : shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("page.emptyFiltered.title")} body={t("page.emptyFiltered.body")} />
        ) : (
          <div style={s.list}>
            {shown.map((c) => (
              <ConventionCard
                key={c.id}
                candidate={c}
                repoFullName={repo?.full_name}
                branch={repo?.default_branch}
                busy={busy}
                onStatus={(status) => update.mutate({ id: c.id, patch: { status } })}
                onEdit={(patch) => update.mutate({ id: c.id, patch })}
                onDelete={() => remove.mutate(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
