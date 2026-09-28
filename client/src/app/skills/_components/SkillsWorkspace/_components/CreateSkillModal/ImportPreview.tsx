/* ImportPreview — the shared "review before you confirm" block for both import
   tabs (From file, Import from URL). Shows the parsed core with editable name /
   description / type, the body as read-only markdown, and the trust notice +
   ignored / flagged archive members. Persists nothing; the panel owns confirm. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, FormField, Icon, Markdown, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { SKILL_TYPE_VALUES } from "../../../../constants";
import { typeColor } from "../../../../helpers";
import { IGNORED_PREVIEW_ROWS } from "./constants";
import { looksExecutable } from "./helpers";
import { s } from "./styles";

export function ImportPreview({
  draft,
  onChange,
  nameError,
}: {
  draft: SkillImportPreview;
  onChange: (draft: SkillImportPreview) => void;
  nameError: string | null;
}) {
  const t = useTranslations("skills");
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`card.type.${v}`) }));
  const tc = typeColor(draft.type);

  return (
    <>
      <div style={s.notice} role="note">
        <Icon.AlertTriangle size={15} style={s.noticeIcon} />
        <span>{t("import.trust")}</span>
      </div>

      <div>
        <div style={s.previewHead}>
          <Icon.Eye size={12} />
          {t("import.previewHeading")}
          <Badge color="var(--text-muted)" mono>
            {t("import.coreEntry")}: {draft.core_entry}
          </Badge>
        </div>

        <div style={s.twoCol}>
          <FormField
            label={t("create.fields.name")}
            required
            hint={nameError && <span style={s.error}>{nameError}</span>}
          >
            <TextInput value={draft.name} onChange={(v) => onChange({ ...draft, name: v })} mono />
          </FormField>
          <FormField label={t("create.fields.type")}>
            <SelectInput
              value={draft.type}
              onChange={(v) => onChange({ ...draft, type: v as SkillType })}
              options={typeOptions}
            />
          </FormField>
        </div>
        <FormField label={t("create.fields.description")} hint={t("config.descriptionHint")}>
          <TextInput value={draft.description} onChange={(v) => onChange({ ...draft, description: v })} />
        </FormField>
      </div>

      <div style={s.section}>
        <div style={s.previewHead}>
          <Icon.FileText size={12} />
          {t("create.fields.body")}
          <Badge color={tc.color} bg={tc.bg}>
            {t(`card.type.${draft.type}`)}
          </Badge>
        </div>
        <div style={s.bodyBox}>
          <Markdown>{draft.body}</Markdown>
        </div>
      </div>

      {draft.warnings.length > 0 && (
        <div style={s.section}>
          <div style={s.previewHead}>
            <Icon.AlertTriangle size={12} />
            {t("import.warnings")}
          </div>
          <ul style={s.memberList}>
            {draft.warnings.map((w) => (
              <li key={w} style={s.warning}>
                <Icon.AlertTriangle size={12} />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft.ignored_entries.length > 0 && <IgnoredMembers entries={draft.ignored_entries} />}
    </>
  );
}

/** Every archive member that was NOT imported — flagged when executable-looking. */
function IgnoredMembers({ entries }: { entries: string[] }) {
  const t = useTranslations("skills");
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? entries : entries.slice(0, IGNORED_PREVIEW_ROWS);
  return (
    <div style={s.section}>
      <div style={s.previewHead}>
        <Icon.Slash size={12} />
        {t("import.ignored", { count: entries.length })}
      </div>
      <div style={{ ...s.dropHint, marginBottom: 6 }}>{t("import.ignoredHint")}</div>
      <ul style={s.memberList}>
        {shown.map((m) => {
          const flagged = looksExecutable(m);
          return (
            <li key={m} className="mono" style={s.member(flagged)}>
              {flagged ? <Icon.AlertTriangle size={12} /> : <Icon.File size={12} />}
              {m}
            </li>
          );
        })}
      </ul>
      {entries.length > IGNORED_PREVIEW_ROWS && (
        <button type="button" style={s.more} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "▲" : `+${entries.length - IGNORED_PREVIEW_ROWS} ▼`}
        </button>
      )}
    </div>
  );
}
