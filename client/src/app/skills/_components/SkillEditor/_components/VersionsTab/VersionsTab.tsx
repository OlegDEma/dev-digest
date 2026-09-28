/* VersionsTab — the skill's body history. Every content save snapshots the body
   into `skill_versions` (server D5); this lists them newest-first, lets the user
   Diff a version against the one before it, and Restore an older body (which the
   PUT re-snapshots as a new current version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { diffCounts, lineDiff } from "./diff";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useUpdateSkill();
  const [openDiff, setOpenDiff] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={62} />
        <div style={{ height: 8 }} />
        <Skeleton height={62} />
      </div>
    );
  }
  if (isError || !versions) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }
  if (versions.length === 0) {
    return <EmptyState icon="History" title={t("versions.title")} body={t("versions.subtitle")} />;
  }

  const onRestore = (v: SkillVersion) => {
    setRestoring(v.version);
    restore.mutate(
      { id: skill.id, patch: { body: v.body } },
      {
        onSuccess: (updated) => {
          toast.success(t("versions.restoredToast", { from: v.version, to: updated.version }));
          setOpenDiff(null);
        },
        onSettled: () => setRestoring(null),
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)" mono>
          {t("versions.count", { count: versions.length })}
        </Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      <div style={s.list}>
        {versions.map((v, idx) => {
          const isCurrent = v.version === skill.version;
          const prev = versions[idx + 1]; // the older version, or undefined for v1
          const diff = lineDiff(prev?.body ?? "", v.body);
          const counts = diffCounts(diff);
          const expanded = openDiff === v.version;
          const changed = counts.added > 0 || counts.removed > 0;

          return (
            <div key={v.version} style={s.row(isCurrent)}>
              <div style={s.rowMain}>
                <span className="mono" style={s.ver}>
                  {t("editor.version", { version: v.version })}
                </span>
                {isCurrent && <span style={s.currentPill}>{t("versions.current")}</span>}
                <span style={s.date}>{formatWhen(v.created_at)}</span>
                <span style={s.spacer} />
                {changed && (
                  <span style={s.counts}>
                    {counts.added > 0 && <span style={s.add}>+{counts.added}</span>}
                    {counts.removed > 0 && <span style={s.del}>−{counts.removed}</span>}
                  </span>
                )}
                <Button
                  kind="tertiary"
                  size="sm"
                  icon={expanded ? "ChevronDown" : "GitCommit"}
                  onClick={() => setOpenDiff(expanded ? null : v.version)}
                >
                  {expanded ? t("versions.hideDiff") : t("versions.diff")}
                </Button>
                {!isCurrent && (
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    onClick={() => onRestore(v)}
                    loading={restoring === v.version}
                    disabled={restoring !== null}
                  >
                    {t("versions.restore")}
                  </Button>
                )}
              </div>

              {expanded && (
                <div style={s.diffPanel}>
                  {!prev && <div style={s.initialNote}>{t("versions.initial")}</div>}
                  {changed ? (
                    <pre style={s.diffPre}>
                      {diff.map((line, li) => (
                        <div key={li} style={s.diffLine(line.type)}>
                          <span style={s.gutter}>
                            {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
                          </span>
                          <span>{line.text || " "}</span>
                        </div>
                      ))}
                    </pre>
                  ) : (
                    <div style={s.noChange}>{t("versions.noChange")}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A skill-version timestamp as a short, locale-aware date-time. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
