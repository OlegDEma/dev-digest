/* EvalCaseAction — "Turn into eval case" for a decided finding of a review that
   has a producing agent. Accepted → must_find, dismissed → must_not_flag (the
   server decides the kind). The outcome message names the kind and links to the
   agent's Evals tab; server errors render as plain text. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCreateEvalCase } from "@/lib/hooks/evals";
import { s } from "./styles";

export function EvalCaseAction({ finding, agentId }: { finding: FindingRecord; agentId: string }) {
  const t = useTranslations("eval");
  const create = useCreateEvalCase();
  const decided = !!finding.accepted_at || !!finding.dismissed_at;
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
        disabled={!decided || create.isPending}
        onClick={() => create.mutate(finding.id)}
      >
        {t("findingCard.turnIntoCase")}
      </Button>
      {!decided && <span style={s.hint}>{t("findingCard.decideFirst")}</span>}
      {create.data && (
        <div role="status" style={s.result}>
          {create.data.created
            ? t("findingCard.created", { kind: create.data.case.expectation.kind })
            : t("findingCard.alreadyCase")}
          <Link href={evalsHref} style={s.link}>
            {t("findingCard.viewEvals")}
          </Link>
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
