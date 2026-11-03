/* EvalCaseAction — "Turn into eval case" for a finding of a review that has a
   producing agent; always enabled. A decided finding becomes a case in one
   click (accepted → must_find, dismissed → must_not_flag; the server decides the
   kind). An undecided one opens the case editor prefilled from the finding's
   draft — nothing is saved until Save; if a case already exists the editor is
   replaced by "Already an eval case". Server errors render as plain text. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalCase, FindingRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { ContextSummary, EvalCaseEditor } from "@/components/eval-case-editor";
import { useAgent } from "@/lib/hooks/agents";
import { useCreateEvalCaseFromFinding, useEvalCaseDraft } from "@/lib/hooks/evals";
import { s } from "./styles";

export function EvalCaseAction({ finding, agentId }: { finding: FindingRecord; agentId: string }) {
  const t = useTranslations("eval");
  const create = useCreateEvalCaseFromFinding();
  const [editing, setEditing] = React.useState(false);
  const [savedCase, setSavedCase] = React.useState<EvalCase | null>(null);
  const agentQ = useAgent(editing ? agentId : null);
  const draftQ = useEvalCaseDraft(editing ? finding.id : null);
  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const caseExists = editing && draftQ.error instanceof ApiError && draftQ.error.code === "eval_case_exists";
  const evalsHref = `/agents/${agentId}?tab=evals`;

  const errorText = (err: Error) =>
    err instanceof ApiError && err.code === "diff_unavailable"
      ? t("findingCard.diffUnavailable", { file: finding.file })
      : t("findingCard.failed", { message: err.message });

  return (
    <>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={create.isPending}
        onClick={() => (decided ? create.mutate(finding.id) : setEditing(true))}
      >
        {t("findingCard.turnIntoCase")}
      </Button>
      {caseExists && (
        <div role="status" style={s.result}>
          {t("findingCard.alreadyCase")}
          <Link href={evalsHref} style={s.link}>
            {t("findingCard.viewEvals")}
          </Link>
        </div>
      )}
      {editing && !caseExists && (
        <EvalCaseEditor
          agent={{ id: agentId, name: agentQ.data?.name ?? "" }}
          findingId={finding.id}
          onClose={() => setEditing(false)}
          onSaved={setSavedCase}
        />
      )}
      {savedCase && !create.data && !caseExists && (
        <div role="status" style={s.result}>
          {t("findingCard.created", { kind: savedCase.expected[0]?.kind ?? "must_find" })}
          <Link href={evalsHref} style={s.link}>
            {t("findingCard.viewEvals")}
          </Link>
        </div>
      )}
      {create.data && (
        <div role="status" style={s.result}>
          {create.data.created
            ? t("findingCard.created", { kind: create.data.case.expected[0]?.kind ?? "must_find" })
            : t("findingCard.alreadyCase")}
          <Link href={evalsHref} style={s.link}>
            {t("findingCard.viewEvals")}
          </Link>
          {create.data.created && create.data.context && <ContextSummary report={create.data.context} />}
        </div>
      )}
      {create.isError && (
        <div role="alert" style={s.error}>
          {errorText(create.error)}
        </div>
      )}
    </>
  );
}
