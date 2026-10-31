/* EvalCaseEditor — modal editor for one agent eval case: name, Input tabs
   (Diff / Files / PR meta), expected output JSON, last-result strip and
   Run on save / Cancel / Run case / Save. Used by the agent's Evals tab (new /
   edit) and by the PR finding card (prefilled from a finding draft).
   Validation that must agree with the server comes from `@devdigest/shared`
   (`validateEvalDiff`, `unmatchableItems`); every user string is rendered as a
   text node, never as markup. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ConfirmDialog, Icon, Modal, Tabs, TextInput } from "@devdigest/ui";
import {
  EVAL_CASE_NAME_RE,
  parseEvalDiff,
  unmatchableItems,
  validateEvalDiff,
  type EvalCase,
} from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgentEvalCases, useAgentEvalRuns, useEvalCaseDraft } from "@/lib/hooks/evals";
import { DiffTab } from "./_components/DiffTab";
import { ExpectedOutput } from "./_components/ExpectedOutput";
import { FilesTab } from "./_components/FilesTab";
import { PrMetaTab } from "./_components/PrMetaTab";
import { ResultStrip } from "./_components/ResultStrip";
import {
  EMPTY_FORM,
  appendSkeleton,
  checkExpected,
  diffMessage,
  filesMessage,
  formFromCase,
  formFromDraft,
  isDirty,
  metaMessage,
  nameMessage,
  type EditorForm,
  type EditorTab,
  type Translate,
} from "./helpers";
import { useCaseSave } from "./useCaseSave";
import { focusTopDialog, useDialogKeys, useRestoreFocus } from "./useDialogKeys";
import { s } from "./styles";

export interface EvalCaseEditorProps {
  agent: { id: string; name: string };
  /** Edit this case (read from the agent's case list). */
  caseId?: string | null;
  /** Prefill from this finding's draft; the saved case is linked to the finding. */
  findingId?: string | null;
  onClose: () => void;
  onSaved?: (saved: EvalCase) => void;
}

export function EvalCaseEditor({ agent, caseId, findingId, onClose, onSaved }: EvalCaseEditorProps) {
  const t = useTranslations("eval");
  const casesQ = useAgentEvalCases(agent.id);
  const draftQ = useEvalCaseDraft(caseId ? null : findingId);

  const existing = caseId ? (casesQ.data ?? []).find((c) => c.id === caseId) : undefined;
  const loading = caseId ? casesQ.isLoading : findingId ? draftQ.isLoading : false;
  // Only the first load can fail the editor: a failed background refetch (isError with cached
  // data) or a case deleted meanwhile must not unmount a form the user is typing in.
  const failedFirstLoad = caseId
    ? casesQ.isLoadingError || (casesQ.isSuccess && !existing)
    : findingId
      ? draftQ.isLoadingError
      : false;
  const shown = React.useRef(false);
  const failed = failedFirstLoad && !shown.current;
  if (!loading && !failed) shown.current = true;

  useRestoreFocus();
  useDialogKeys(onClose, loading || failed);
  const loadError = caseId ? casesQ.error : draftQ.error;

  if (loading || failed) {
    return (
      <Modal width={560} title={t("caseEditor.newCase")} onClose={onClose}>
        {loading ? (
          <div style={s.center} role="status">
            <Icon.RefreshCw size={16} style={s.spin} />
            {t("caseEditor.loading")}
          </div>
        ) : (
          <div style={s.loadError} role="alert">
            {loadError instanceof ApiError && loadError.code === "diff_unavailable" ? (
              t("caseEditor.diffUnavailable")
            ) : (
              <>
                {t("caseEditor.loadError")}
                {loadError?.message && <div>{loadError.message}</div>}
              </>
            )}
            <div style={s.footer}>
              <span style={s.spacer} />
              <Button kind="secondary" onClick={onClose}>
                {t("caseEditor.close")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    );
  }

  const initial = existing ? formFromCase(existing) : draftQ.data ? formFromDraft(draftQ.data) : EMPTY_FORM;
  return (
    <EditorBody
      agent={agent}
      initial={initial}
      initialCaseId={existing?.id ?? null}
      findingId={caseId ? null : (findingId ?? null)}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function EditorBody({
  agent,
  initial,
  initialCaseId,
  findingId,
  onClose,
  onSaved,
}: {
  agent: { id: string; name: string };
  initial: EditorForm;
  initialCaseId: string | null;
  findingId: string | null;
  onClose: () => void;
  onSaved: ((saved: EvalCase) => void) | undefined;
}) {
  const t = useTranslations("eval") as Translate;
  const casesQ = useAgentEvalCases(agent.id);
  const runsQ = useAgentEvalRuns(agent.id);

  const [form, setForm] = React.useState<EditorForm>(initial);
  const [tab, setTab] = React.useState<EditorTab>("diff");
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const parsed = React.useMemo(() => parseEvalDiff(form.diff), [form.diff]);
  const diffProblem = React.useMemo(() => validateEvalDiff(form.diff), [form.diff]);
  const expected = React.useMemo(() => checkExpected(form.expectedText), [form.expectedText]);
  const neverMatch = React.useMemo(
    () => (expected.ok && parsed.files.length > 0 ? unmatchableItems(expected.items, parsed) : []),
    [expected, parsed],
  );
  const diffPaths = React.useMemo(() => new Set(parsed.files.map((f) => f.path)), [parsed]);

  const nameValid = EVAL_CASE_NAME_RE.test(form.name);
  const filesValid = form.files.every((f) => f.path.trim() !== "");

  const sv = useCaseSave({
    agentId: agent.id,
    initial,
    initialCaseId,
    findingId,
    form,
    expected,
    valid: nameValid && expected.ok && !diffProblem && filesValid,
    onClose,
    onSaved,
    onProblemTab: setTab,
  });
  const { savedId, problem } = sv;

  const edit = (patch: Partial<EditorForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    sv.clearProblem();
  };

  const dirty = isDirty(form, sv.baseline);
  const canSave = nameValid && expected.ok && !diffProblem && filesValid && !sv.saving;

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());
  useDialogKeys(() => (confirmDiscard ? setConfirmDiscard(false) : requestClose()));
  React.useEffect(() => {
    if (confirmDiscard) focusTopDialog();
  }, [confirmDiscard]);

  const liveCase = savedId ? ((casesQ.data ?? []).find((c) => c.id === savedId) ?? null) : null;
  const activeRuns = (runsQ.data ?? []).filter((r) => r.status === "running" || r.status === "queued");
  const agentBusy = sv.runPending || activeRuns.length > 0;
  const caseRunning = sv.runPending || (!!savedId && activeRuns.some((r) => r.case_ids.includes(savedId)));
  const needsSave = !savedId || dirty;

  const onSkeleton = () => {
    const next = appendSkeleton(form.expectedText, form.diff);
    if (next !== null) edit({ expectedText: next });
  };

  const title = form.name ? t("caseEditor.caseTitle", { name: form.name }) : t("caseEditor.caseTitleNew");
  const nameText = nameMessage(t, problem, form.name, nameValid);

  return (
    <>
      <Modal
        width={760}
        title={title}
        subtitle={t("caseEditor.subtitle", { agent: agent.name })}
        onClose={requestClose}
        footer={
          <div style={s.footer}>
            <label style={s.runOnSave}>
              <input type="checkbox" checked={sv.runOnSave} onChange={(e) => sv.setRunOnSave(e.target.checked)} />
              {t("caseEditor.runOnSave")}
            </label>
            <span style={s.spacer} />
            <Button kind="secondary" onClick={requestClose}>
              {t("caseEditor.cancel")}
            </Button>
            <div style={s.runGroup}>
              {needsSave && <span style={s.hint}>{t("caseEditor.saveFirst")}</span>}
              <Button
                kind="secondary"
                icon="Play"
                disabled={needsSave || agentBusy}
                onClick={() => savedId && sv.startCaseRun(savedId)}
              >
                {t("caseEditor.runCase")}
              </Button>
            </div>
            <Button kind="primary" disabled={!canSave} loading={sv.saving} onClick={sv.save}>
              {sv.saving ? t("caseEditor.saving") : t("caseEditor.save")}
            </Button>
          </div>
        }
      >
        <div style={s.body}>
          <div>
            <label>
              <span style={s.nameLabel}>{t("caseEditor.nameLabel")}</span>
              <TextInput
                mono
                data-autofocus=""
                value={form.name}
                onChange={(v) => edit({ name: v })}
                placeholder={t("caseEditor.namePlaceholder")}
              />
            </label>
            {nameText && (
              <div role="alert" style={s.error}>
                {nameText}
              </div>
            )}
          </div>

          <div>
            <div style={s.inputLabel}>{t("caseEditor.inputLabel")}</div>
            <Tabs
              pad="0"
              value={tab}
              onChange={(k) => setTab(k as EditorTab)}
              tabs={[
                { key: "diff", label: t("caseEditor.tabs.diff") },
                { key: "files", label: t("caseEditor.tabs.files"), count: form.files.length || undefined },
                { key: "meta", label: t("caseEditor.tabs.prMeta") },
              ]}
            />
            <div style={s.tabPanel}>
              {tab === "diff" && (
                <DiffTab
                  diff={form.diff}
                  onChange={(v) => edit({ diff: v })}
                  problem={diffMessage(t, problem, form.diff, diffProblem)}
                />
              )}
              {tab === "files" && (
                <FilesTab
                  files={form.files}
                  diffPaths={diffPaths}
                  onChange={(files) => edit({ files })}
                  problem={filesMessage(t, problem)}
                />
              )}
              {tab === "meta" && (
                <PrMetaTab
                  title={form.prTitle}
                  description={form.prDescription}
                  onTitle={(v) => edit({ prTitle: v })}
                  onDescription={(v) => edit({ prDescription: v })}
                  titleProblem={metaMessage(t, problem, "pr_title")}
                  descriptionProblem={metaMessage(t, problem, "pr_description")}
                />
              )}
            </div>
          </div>

          <ExpectedOutput
            text={form.expectedText}
            check={expected}
            neverMatch={neverMatch}
            canSkeleton={appendSkeleton(form.expectedText, "") !== null}
            onChange={(v) => edit({ expectedText: v })}
            onSkeleton={onSkeleton}
          />

          {problem?.kind === "other" && (
            <div role="alert" style={s.error}>
              {t("caseEditor.saveFailed", { message: problem.message })}
            </div>
          )}

          <ResultStrip running={caseRunning} runError={sv.runError} case={liveCase} />
        </div>
      </Modal>

      {confirmDiscard && (
        <ConfirmDialog
          title={t("caseEditor.discardTitle")}
          body={t("caseEditor.discardBody")}
          confirmLabel={t("caseEditor.discardConfirm")}
          cancelLabel={t("caseEditor.keepEditing")}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onClose}
        />
      )}
    </>
  );
}
