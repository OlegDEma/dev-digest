/* useCaseSave — the editor's save flow: create (linked to a finding) or update,
   then either close, or — with "Run on save" — start a scope-case run and stay
   open so the result strip shows it. A rejected run leaves the case saved. */
"use client";

import React from "react";
import type { EvalCase } from "@devdigest/shared";
import { useCreateEvalCase, useStartEvalRun, useUpdateEvalCase } from "@/lib/hooks/evals";
import {
  classifySaveError,
  tabOfProblem,
  toBody,
  type EditorForm,
  type EditorTab,
  type ExpectedCheck,
  type SaveProblem,
} from "./helpers";

export function useCaseSave({
  agentId,
  initial,
  initialCaseId,
  findingId,
  form,
  expected,
  valid,
  onClose,
  onSaved,
  onProblemTab,
}: {
  agentId: string;
  initial: EditorForm;
  initialCaseId: string | null;
  findingId: string | null;
  form: EditorForm;
  expected: ExpectedCheck;
  /** Name, expected output, diff and files all valid. */
  valid: boolean;
  onClose: () => void;
  onSaved: ((saved: EvalCase) => void) | undefined;
  /** A save problem that belongs to a tab: bring that tab into view. */
  onProblemTab: (tab: EditorTab) => void;
}) {
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);
  const startRun = useStartEvalRun(agentId, { silentError: true });

  const [baseline, setBaseline] = React.useState<EditorForm>(initial);
  const [savedId, setSavedId] = React.useState<string | null>(initialCaseId);
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [problem, setProblem] = React.useState<SaveProblem | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  const startCaseRun = (id: string) => {
    setRunError(null);
    startRun.mutate(
      { case_id: id },
      { onError: (err) => setRunError(err instanceof Error ? err.message : String(err)) },
    );
  };

  const onSuccess = (saved: EvalCase) => {
    setSavedId(saved.id);
    setBaseline(form);
    setRunError(null);
    onSaved?.(saved);
    if (runOnSave) startCaseRun(saved.id);
    else onClose();
  };
  const onError = (err: unknown) => {
    const p = classifySaveError(err);
    setProblem(p);
    const target = tabOfProblem(p);
    if (target) onProblemTab(target);
  };

  const save = () => {
    if (!valid || saving || !expected.ok) return;
    const body = toBody(form, expected.items);
    setProblem(null);
    if (savedId) {
      update.mutate({ id: savedId, body }, { onSuccess, onError });
    } else {
      create.mutate(
        { ...body, ...(findingId ? { source_finding_id: findingId } : {}) },
        { onSuccess, onError },
      );
    }
  };

  return {
    baseline,
    savedId,
    runOnSave,
    setRunOnSave,
    problem,
    clearProblem: () => setProblem(null),
    runError,
    saving,
    runPending: startRun.isPending,
    save,
    startCaseRun,
  };
}
