/* BriefRiskAreas — the brief's validated risks: severity icon, title, first
   file ref; expands to the explanation and the remaining refs. Replaces the
   intent's risk-area chips in the Intent column once a brief exists. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { parseRef, severityColor } from "./helpers";
import { s } from "./styles";

interface BriefRiskAreasProps {
  risks: Risk[];
  onOpenRef: (path: string, line: number | null) => void;
}

function RefButton({ refStr, onOpenRef }: { refStr: string; onOpenRef: BriefRiskAreasProps["onOpenRef"] }) {
  const t = useTranslations("brief");
  const { path, line } = parseRef(refStr);
  return (
    <button
      type="button"
      className="mono"
      style={s.link}
      aria-label={line == null ? t("prBrief.openFileAria", { path }) : t("prBrief.openLineAria", { path, line })}
      onClick={() => onOpenRef(path, line)}
    >
      {refStr}
    </button>
  );
}

function RiskRow({ risk, onOpenRef }: { risk: Risk; onOpenRef: BriefRiskAreasProps["onOpenRef"] }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const [first, ...rest] = risk.file_refs;
  return (
    <li style={s.row}>
      <div style={s.head}>
        <span style={s.icon(severityColor(risk.severity))} role="img" aria-label={t(`prBrief.severity.${risk.severity}`)}>
          <Icon.AlertTriangle size={14} />
        </span>
        <span style={s.title}>{risk.title}</span>
        <button
          type="button"
          style={s.toggle}
          aria-expanded={open}
          aria-label={`${open ? t("prBrief.collapseRisk") : t("prBrief.expandRisk")}: ${risk.title}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>
      {first && (
        <div style={s.details}>
          <RefButton refStr={first} onOpenRef={onOpenRef} />
        </div>
      )}
      {open && (
        <div style={s.details}>
          <p style={s.explanation}>{risk.explanation}</p>
          {rest.length > 0 && (
            <div style={s.refs}>
              {rest.map((r, i) => (
                <RefButton key={`${i}-${r}`} refStr={r} onOpenRef={onOpenRef} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function BriefRiskAreas({ risks, onOpenRef }: BriefRiskAreasProps) {
  const t = useTranslations("brief");
  return (
    <div style={s.wrap}>
      <div style={s.heading}>{t("prBrief.riskAreas")}</div>
      {risks.length === 0 ? (
        <span style={s.empty}>{t("noRisks")}</span>
      ) : (
        <ul style={s.list}>
          {risks.map((r, i) => (
            <RiskRow key={`${i}-${r.title}`} risk={r} onOpenRef={onOpenRef} />
          ))}
        </ul>
      )}
    </div>
  );
}
