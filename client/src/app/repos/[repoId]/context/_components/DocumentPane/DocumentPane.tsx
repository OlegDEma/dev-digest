/* DocumentPane — the selected document: Preview (rendered markdown) or Edit
   (raw text in a textarea, saved in place). A tracked git file shows the
   Resync warning; a failed save keeps the text in the editor. Reports unsaved
   text upward so the page can ask before discarding it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import type { DiscoveredDocument } from "@devdigest/shared";
import { BucketBadge } from "../../../../../../components/project-context/BucketBadge";
import { DocMarkdown } from "../../../../../../components/project-context/DocMarkdown";
import { useContextDocument, useSaveContextDocument } from "../../../../../../lib/hooks/project-context";
import { MODES, RESYNC_TARGET, type Mode } from "../../constants";
import { s } from "./styles";

export function DocumentPane({
  repoId,
  doc,
  onDirtyChange,
}: {
  repoId: string;
  doc: DiscoveredDocument;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const t = useTranslations("context");
  const readable = doc.status === "ok";
  const { data, isLoading, isError } = useContextDocument(repoId, doc.path, readable);
  const save = useSaveContextDocument(repoId);
  const [mode, setMode] = React.useState<Mode>("preview");
  const [draft, setDraft] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const dirty = data != null && draft !== null && draft !== data.text;
  React.useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const onSave = () => {
    if (draft === null) return;
    setSaveError(null);
    save.mutate(
      { path: doc.path, text: draft },
      {
        onSuccess: () => setDraft(null),
        onError: (e) => setSaveError(t("editor.saveError", { message: (e as Error).message })),
      },
    );
  };

  return (
    <section style={s.pane} aria-label={doc.path}>
      <div style={s.head}>
        <span className="mono" style={s.path}>
          {doc.path}
        </span>
        <BucketBadge bucket={doc.bucket} />
        <span style={s.meta}>{t("usedBy", { count: doc.used_by_agents })}</span>
        {doc.estimated_tokens != null && <span style={s.meta}>{t("tokens", { count: doc.estimated_tokens })}</span>}
        <span style={s.spacer} />
        {readable && (
          <div style={s.modes}>
            {MODES.map((m) => (
              <Button key={m} kind="secondary" size="sm" active={mode === m} onClick={() => setMode(m)}>
                {t(`mode.${m}`)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {!readable ? (
        <div style={s.marker}>{t(`docStatus.${doc.status}`)}</div>
      ) : isLoading ? (
        <Skeleton height={200} />
      ) : isError || !data ? (
        <div role="alert" style={s.marker}>
          {t("editor.loadError")}
        </div>
      ) : mode === "preview" ? (
        <DocMarkdown>{data.text}</DocMarkdown>
      ) : (
        <>
          {data.tracked && (
            <p role="note" style={s.warn}>
              {t("editor.trackedWarning", { target: RESYNC_TARGET })}
            </p>
          )}
          <textarea
            className="mono"
            style={s.textarea}
            aria-label={t("editor.label", { path: doc.path })}
            value={draft ?? data.text}
            onChange={(e) => setDraft(e.target.value)}
          />
          {saveError && (
            <p role="alert" style={s.error}>
              {saveError}
            </p>
          )}
          <div style={s.footer}>
            <Button kind="primary" size="sm" onClick={onSave} loading={save.isPending} disabled={!dirty || save.isPending}>
              {save.isPending ? t("editor.saving") : t("editor.save")}
            </Button>
            {dirty && <span style={s.dirty}>{t("editor.unsaved")}</span>}
          </div>
        </>
      )}
    </section>
  );
}
