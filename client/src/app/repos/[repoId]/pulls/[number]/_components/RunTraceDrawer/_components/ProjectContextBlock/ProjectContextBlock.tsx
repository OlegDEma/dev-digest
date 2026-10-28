/* ProjectContextBlock — the "Project context — attached specs (untrusted)"
   block of the Prompt assembly section: one expandable item per injected
   document (path, tokens, source repo; expanded = the exact wrapped text with
   copy and in-block search) and the list of skipped documents with reasons.
   Renders from `specs_docs`, so a run that skipped everything still shows why. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, TextInput } from "@devdigest/ui";
import type { ProjectContextDoc } from "@devdigest/shared";
import { approxTokens, formatTokenCount } from "@/lib/format";
import { PROMPT_COLORS } from "../../constants";
import { s as drawer } from "../../styles";
import { s } from "./styles";

function highlightLine(line: string, q: string): React.ReactNode {
  const idx = line.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return line;
  return (
    <>
      {line.slice(0, idx)}
      <mark style={s.mark}>{line.slice(idx, idx + q.length)}</mark>
      {highlightLine(line.slice(idx + q.length), q)}
    </>
  );
}

function tokensOf(d: ProjectContextDoc): number {
  return d.estimated_tokens ?? approxTokens(d.wrapped_text);
}

function InjectedItem({ doc }: { doc: ProjectContextDoc }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const text = doc.wrapped_text ?? "";
  const query = q.trim();
  const lines = React.useMemo(() => text.split("\n"), [text]);
  const shown = query ? lines.filter((l) => l.toLowerCase().includes(query.toLowerCase())) : lines;

  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <li style={s.item}>
      <div style={s.itemHead}>
        <button type="button" style={s.itemToggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="mono" style={s.itemPath}>
            {doc.path}
          </span>
          <Badge color="var(--text-muted)" mono>
            {t("trace.prompt.tokens", { count: formatTokenCount(tokensOf(doc)) })}
          </Badge>
          <span className="mono" style={s.itemRepo}>
            {doc.repo}
          </span>
        </button>
        <button
          type="button"
          title={t("trace.prompt.copy")}
          aria-label={`${t("trace.prompt.copy")} ${doc.path}`}
          onClick={copy}
          style={drawer.miniBtn}
        >
          {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
        </button>
      </div>
      {open && (
        <div style={s.itemBody}>
          <div style={s.searchRow}>
            <TextInput value={q} onChange={setQ} placeholder={t("trace.prompt.itemSearch")} aria-label={t("trace.prompt.itemSearch")} />
          </div>
          {query && shown.length === 0 ? (
            <div style={s.noMatch}>{t("trace.prompt.noMatches", { q: query })}</div>
          ) : (
            <pre className="mono" style={drawer.promptPre}>
              {query ? shown.map((l, i) => <div key={i}>{highlightLine(l, query)}</div>) : text}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

export function ProjectContextBlock({ docs }: { docs: ProjectContextDoc[] }) {
  const t = useTranslations("runs");
  const injected = docs.filter((d) => d.status === "injected");
  const skipped = docs.filter((d) => d.status === "skipped");
  const total = injected.reduce((sum, d) => sum + tokensOf(d), 0);

  return (
    <div style={drawer.promptRow}>
      {injected.length > 0 && (
        <div style={{ ...drawer.promptHead, cursor: "default" }}>
          <span style={drawer.promptDot(PROMPT_COLORS.specs)} />
          <span style={drawer.promptLabel}>{t("trace.prompt.specs")}</span>
          <Badge color="var(--text-muted)" mono>
            {t("trace.prompt.tokens", { count: formatTokenCount(total) })}
          </Badge>
          <span style={drawer.promptExpand}>{t("trace.prompt.specsInjected", { count: injected.length })}</span>
        </div>
      )}
      {injected.length > 0 && (
        <ul style={{ ...s.items, listStyle: "none", margin: 0, padding: 0 }}>
          {injected.map((d, i) => (
            <InjectedItem key={`${d.repo}:${d.path}:${i}`} doc={d} />
          ))}
        </ul>
      )}
      {skipped.length > 0 && (
        <div style={s.skipped}>
          <div style={s.skippedTitle}>{t("trace.prompt.specsSkipped")}</div>
          <ul style={s.skippedList}>
            {skipped.map((d, i) => (
              <li key={`${d.repo}:${d.path}:${i}`} style={s.skippedItem}>
                <span className="mono">{d.path}</span>
                {d.reason && <span style={s.reason}>{t(`trace.skippedReason.${d.reason}`)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
