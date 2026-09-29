/* ConventionCard — one extracted house rule: the rule, the code that proves it,
   how confident we are, and the triage controls. Edit happens INLINE: the rule
   and rationale become fields in place, so triaging a board never costs a
   navigation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, confidencePct, evidenceLabel, evidenceUrl } from "../../helpers";
import { cardStyles as s } from "../../styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  repoFullName?: string | null;
  branch?: string | null;
  busy?: boolean;
  onStatus: (status: ConventionCandidate["status"]) => void;
  onEdit: (patch: { rule: string; rationale: string | null }) => void;
  onDelete: () => void;
}

export function ConventionCard({
  candidate: c,
  repoFullName,
  branch,
  busy,
  onStatus,
  onEdit,
  onDelete,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(c.rule);
  const [rationale, setRationale] = React.useState(c.rationale ?? "");

  const startEdit = () => {
    setRule(c.rule);
    setRationale(c.rationale ?? "");
    setEditing(true);
  };

  const save = () => {
    const trimmed = rule.trim();
    if (!trimmed) return;
    // An emptied rationale is a deliberate clear, so send null rather than "".
    onEdit({ rule: trimmed, rationale: rationale.trim() || null });
    setEditing(false);
  };

  const href = evidenceUrl(repoFullName, branch, c.evidence_path, c.evidence_line);
  const pct = confidencePct(c.confidence);

  return (
    <div style={s.card(c.status)}>
      <div style={s.main}>
        {editing ? (
          <>
            <input
              aria-label={t("card.rulePlaceholder")}
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              placeholder={t("card.rulePlaceholder")}
              style={s.editField}
            />
            <input
              aria-label={t("card.rationalePlaceholder")}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder={t("card.rationalePlaceholder")}
              style={s.editField}
            />
          </>
        ) : (
          <>
            <div style={s.ruleRow}>
              <p style={s.rule}>{c.rule}</p>
              <Badge>{t(`card.category.${c.category}`)}</Badge>
            </div>
            {c.rationale && <p style={s.rationale}>{c.rationale}</p>}
          </>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                title={t("card.viewOnGitHub")}
                className="mono"
                style={s.evidenceLink}
              >
                {evidenceLabel(c.evidence_path, c.evidence_line)}
              </a>
            ) : (
              <span className="mono">{evidenceLabel(c.evidence_path, c.evidence_line)}</span>
            )}
          </div>
          <pre className="mono" style={s.evidenceCode}>
            {c.evidence_snippet}
          </pre>
        </div>

        <div style={s.meta}>
          <span style={s.metaLabel}>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={confidenceColor(c.confidence)} />
          </div>
          <span className="tnum" style={s.pct}>
            {pct}%
          </span>
          {/* Measured by ripgrep over the repo, not self-reported by the model. */}
          {c.occurrences != null && (
            <Badge icon="Search" mono>
              {t("card.occurrences", { count: c.occurrences })}
            </Badge>
          )}
        </div>
      </div>

      <div style={s.side}>
        {editing ? (
          <>
            <Button kind="primary" size="sm" icon="Check" full onClick={save} disabled={busy}>
              {t("card.save")}
            </Button>
            <Button kind="secondary" size="sm" full onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              kind={c.status === "accepted" ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              full
              disabled={busy}
              onClick={() => onStatus(c.status === "accepted" ? "pending" : "accepted")}
            >
              {c.status === "accepted" ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              kind={c.status === "rejected" ? "danger" : "secondary"}
              size="sm"
              icon="X"
              full
              disabled={busy}
              onClick={() => onStatus(c.status === "rejected" ? "pending" : "rejected")}
            >
              {c.status === "rejected" ? t("card.rejected") : t("card.reject")}
            </Button>
            <Button kind="ghost" size="sm" icon="Edit" full disabled={busy} onClick={startEdit}>
              {t("card.edit")}
            </Button>
            <IconBtn icon="Trash" label={t("card.delete")} danger onClick={onDelete} />
          </>
        )}
      </div>
    </div>
  );
}
