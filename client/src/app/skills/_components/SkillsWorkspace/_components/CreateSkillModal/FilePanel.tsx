/* FilePanel — the "From file" tab: pick a .md / .zip → the server returns a
   PREVIEW of the skill core (persisting nothing) → the user may fix name /
   description / type → confirm persists it via POST /skills. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { ImportPreview } from "./ImportPreview";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from "./constants";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function FilePanel({ onCreated }: { onCreated: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);
  const [draft, setDraft] = React.useState<SkillImportPreview | null>(null);
  const [touched, setTouched] = React.useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name}: > ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB`);
      return;
    }
    setReading(true);
    try {
      const content_b64 = await readFileAsBase64(file);
      const result = await preview.mutateAsync({ filename: file.name, content_b64 });
      setDraft(result);
      setTouched(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setReading(false);
    }
  };

  const reset = () => {
    setDraft(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
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
        <label style={s.dropzone}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            aria-label={t("import.pick")}
            style={s.hiddenInput}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Icon.Upload size={22} style={s.dropIcon} />
          <Button
            kind="secondary"
            size="sm"
            icon="Folder"
            loading={reading || preview.isPending}
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            {reading || preview.isPending ? t("import.reading") : t("import.pick")}
          </Button>
          <span style={s.dropHint}>{t("import.pickHint")}</span>
        </label>
      ) : (
        <>
          <ImportPreview draft={draft} onChange={setDraft} nameError={nameError} />
          <div style={s.resetRow}>
            <Button kind="tertiary" size="sm" icon="Upload" onClick={reset} disabled={create.isPending}>
              {t("import.another")}
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
