/* UrlPanel — the "Import from URL" tab: paste a public link to a SKILL.md (or a
   .zip); the server fetches it (SSRF-guarded) and returns the same preview as a
   file upload → the user confirms → POST /skills. Nothing is fetched until the
   user clicks, and nothing is persisted until they confirm. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillUrlPreview } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { ImportPreview } from "./ImportPreview";
import { s } from "./styles";

export function UrlPanel({ onCreated }: { onCreated: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportSkillUrlPreview();
  const create = useCreateSkill();
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SkillImportPreview | null>(null);
  const [touched, setTouched] = React.useState(false);

  const fetchUrl = async () => {
    const u = url.trim();
    if (u.length === 0) return;
    setError(null);
    try {
      const result = await preview.mutateAsync({ url: u });
      setDraft(result);
      setTouched(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    }
  };

  const reset = () => {
    setDraft(null);
    setError(null);
  };

  const confirm = () => {
    if (!draft) return;
    setTouched(true);
    if (draft.name.trim().length === 0) return;
    create.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim(),
        type: draft.type,
        body: draft.body,
        source: draft.source,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("import.successToast", { name: skill.name }));
          onCreated(skill);
        },
      },
    );
  };

  const nameError = touched && draft && draft.name.trim().length === 0 ? t("config.validation.nameRequired") : null;

  return (
    <div style={s.panel}>
      {error && (
        <div style={s.errorBox} role="alert">
          <strong>{t("import.failed")}:</strong> {error}
        </div>
      )}
      {!draft ? (
        <FormField label={t("import.url.label")} hint={t("import.url.hint")}>
          <div style={s.urlRow}>
            <div style={s.urlGrow}>
              <TextInput
                value={url}
                onChange={setUrl}
                placeholder={t("import.url.placeholder")}
                type="url"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void fetchUrl();
                  }
                }}
              />
            </div>
            <Button
              kind="secondary"
              icon="ArrowRight"
              onClick={() => void fetchUrl()}
              loading={preview.isPending}
              disabled={url.trim().length === 0}
            >
              {preview.isPending ? t("import.url.fetching") : t("import.url.fetch")}
            </Button>
          </div>
        </FormField>
      ) : (
        <>
          <ImportPreview draft={draft} onChange={setDraft} nameError={nameError} />
          <div style={s.resetRow}>
            <Button kind="tertiary" size="sm" icon="Globe" onClick={reset} disabled={create.isPending}>
              {t("import.url.another")}
            </Button>
          </div>
          <div style={s.primary}>
            <Button kind="primary" icon="Check" full onClick={confirm} loading={create.isPending}>
              {create.isPending ? t("import.importing") : t("import.confirm")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
