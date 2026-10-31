/* PromoteConfirm — the last step before a run's config overwrites the live agent:
   lists exactly what changes (prompt, model, strategy, skills to link and unlink)
   and warns about skills whose version moved since the run. A stale agent
   (409 agent_changed) gets a message and Reload; a missing skill (422) is named.
   The unlink list is the agent's currently linked skills that the run did not use.
   All names are rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalConfigSnapshot, EvalRunDetail } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { usePromoteEvalRun } from "@/lib/hooks/eval-dashboards";
import { useAgentSkills, useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { planPromotion } from "./helpers";
import { s } from "./styles";

/** Skill names the server lists in a 422 `skill_unavailable` body, when it sends any. */
function missingSkillNames(details: unknown): string[] {
  const d = details as { skills?: unknown; missing?: unknown } | undefined;
  const list = Array.isArray(d?.skills) ? d.skills : Array.isArray(d?.missing) ? d.missing : [];
  return list.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name)).filter((x): x is string => !!x);
}

export function PromoteConfirm({
  agentId,
  run,
  live,
  onReload,
  onCancel,
  onDone,
}: {
  agentId: string;
  run: EvalRunDetail;
  live: EvalConfigSnapshot;
  onReload: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("evalDashboard");
  const toast = useToast();
  const linksQ = useAgentSkills(agentId);
  const skillsQ = useSkills();
  const promote = usePromoteEvalRun(agentId);
  const loading = linksQ.isLoading || skillsQ.isLoading;
  const loadFailed = !loading && (linksQ.isError || skillsQ.isError);
  const notReady = loading || loadFailed;

  const plan = React.useMemo(
    () => planPromotion(live, run.config, linksQ.data ?? [], skillsQ.data ?? []),
    [live, run.config, linksQ.data, skillsQ.data],
  );

  React.useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !promote.isPending) onCancel();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onCancel, promote.isPending]);

  const confirm = () =>
    promote.mutate(
      { run_id: run.id, expected_config_id: live.config_id },
      {
        onSuccess: (res) => {
          toast.success(t("promote.success", { version: run.config.agent_version, newVersion: res.version }));
          onDone();
        },
      },
    );

  const err = promote.error;
  const apiErr = err instanceof ApiError ? err : null;
  const stale = apiErr?.code === "agent_changed";
  const unavailable = apiErr?.code === "skill_unavailable";

  return (
    <Modal
      width={520}
      title={t("promote.title", { version: run.config.agent_version })}
      onClose={promote.isPending ? undefined : onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onCancel} disabled={promote.isPending}>
            {t("promote.cancel")}
          </Button>
          <Button kind="primary" onClick={confirm} loading={promote.isPending} disabled={promote.isPending || stale || notReady}>
            {promote.isPending ? t("promote.promoting") : t("promote.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <p style={s.p}>{t("promote.intro")}</p>
        <h3 style={s.h3}>{t("promote.changes")}</h3>
        {loading && (
          <div role="status" style={s.p}>
            {t("promote.loadingSkills")}
          </div>
        )}
        {loadFailed && (
          <div role="alert" style={s.error}>
            {t("promote.skillsError")}
          </div>
        )}
        {!notReady && (
        <ul style={s.list} data-testid="promote-changes">
          {plan.promptChanged && <li>{t("promote.prompt")}</li>}
          {plan.model && <li>{t("promote.model", plan.model)}</li>}
          {plan.strategy && <li>{t("promote.strategy", plan.strategy)}</li>}
          {plan.link.length > 0 && <li>{t("promote.link", { names: plan.link.join(", ") })}</li>}
          {plan.unlink.length > 0 && <li>{t("promote.unlink", { names: plan.unlink.join(", ") })}</li>}
          {!plan.hasChanges && <li>{t("promote.noChanges")}</li>}
        </ul>
        )}
        {!notReady && plan.versionWarnings.length > 0 && (
          <div role="note" style={s.warn}>
            {plan.versionWarnings.map((w) => (
              <div key={w.name}>{t("promote.skillVersion", w)}</div>
            ))}
          </div>
        )}
        {err && (
          <div role="alert" style={s.error}>
            {stale ? (
              <>
                {t("promote.agentChanged")}{" "}
                <Button
                  kind="secondary"
                  size="sm"
                  onClick={() => {
                    onReload();
                    onCancel();
                  }}
                >
                  {t("promote.reload")}
                </Button>
              </>
            ) : unavailable ? (
              t("promote.skillUnavailable", { names: missingSkillNames(apiErr?.details).join(", ") })
            ) : (
              t("promote.failed", { message: err.message })
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
