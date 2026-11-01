/* FilesTab — extra files the agent sees as untrusted context. A file whose path
   is not a file of the diff is labelled "context only": findings on it are
   dropped by grounding and never scored. Paths are labels, never read from disk. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, Textarea, TextInput } from "@devdigest/ui";
import type { EvalCaseInputFile } from "@devdigest/shared";
import { s } from "./styles";

export function FilesTab({
  files,
  diffPaths,
  onChange,
  problem,
}: {
  files: EvalCaseInputFile[];
  /** Paths of the files in the case's diff. */
  diffPaths: ReadonlySet<string>;
  onChange: (next: EvalCaseInputFile[]) => void;
  /** Limit or duplicate-path message for this tab; null when fine. */
  problem: string | null;
}) {
  const t = useTranslations("eval");
  // Stable row ids so removing a row never hands its DOM (focus, caret) to another file.
  // They live only here: `files` stays plain {path, content} and is what the editor saves.
  const rowIds = React.useRef<string[]>([]);
  const nextId = React.useRef(0);
  while (rowIds.current.length < files.length) rowIds.current.push(`row-${nextId.current++}`);
  if (rowIds.current.length > files.length) rowIds.current.length = files.length;
  const patch = (i: number, p: Partial<EvalCaseInputFile>) =>
    onChange(files.map((f, j) => (j === i ? { ...f, ...p } : f)));

  return (
    <div>
      {files.length === 0 && <div style={s.empty}>{t("caseEditor.files.empty")}</div>}
      {files.map((f, i) => (
        <div key={rowIds.current[i]} style={s.entry} data-testid="file-entry">
          <div style={s.pathRow}>
            <div style={s.grow}>
              <TextInput
                mono
                value={f.path}
                onChange={(v) => patch(i, { path: v })}
                aria-label={t("caseEditor.files.pathLabel")}
                placeholder="src/lib/util.ts"
              />
            </div>
            <IconBtn
              icon="Trash"
              danger
              label={t("caseEditor.files.remove", { path: f.path })}
              onClick={() => {
                rowIds.current = rowIds.current.filter((_, j) => j !== i);
                onChange(files.filter((_, j) => j !== i));
              }}
            />
          </div>
          <label>
            <span style={s.srOnly}>{t("caseEditor.files.contentLabel")}</span>
            <Textarea mono rows={5} value={f.content} onChange={(v) => patch(i, { content: v })} />
          </label>
          {!f.path.trim() ? (
            <div style={s.error}>{t("caseEditor.files.pathRequired")}</div>
          ) : (
            !diffPaths.has(f.path) && <div style={s.contextOnly}>{t("caseEditor.files.contextOnly")}</div>
          )}
        </div>
      ))}
      {problem && (
        <div role="alert" style={s.error}>
          {problem}
        </div>
      )}
      <div style={s.add}>
        <Button kind="secondary" size="sm" icon="Plus" onClick={() => onChange([...files, { path: "", content: "" }])}>
          {t("caseEditor.files.add")}
        </Button>
      </div>
    </div>
  );
}
