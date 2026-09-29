/* ConventionsSkillModal — turn the accepted candidates into a skill. The server
   assembles a DRAFT and persists nothing; everything shown here is editable,
   and only "Create skill" writes anything. Named for what it makes rather than
   `CreateSkillModal`, which already exists under /skills and means the generic
   create/import flow. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import { useToast } from "../../../../../../lib/toast";
import type { ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "../../../../../skills/_components/SkillEditor/_components/SkillBodyEditor";
import { useCreateSkill, useLinkAgentSkill } from "../../../../../../lib/hooks/skills";
import { useAgents } from "../../../../../../lib/hooks/agents";
import { s } from "./styles";

const SKILL_TYPES: SkillType[] = ["rubric", "convention", "security", "custom"];

export interface ConventionsSkillModalProps {
  draft: ConventionSkillDraft;
  acceptedCount: number;
  repoName: string;
  onClose: () => void;
  onCreated?: () => void;
}

export function ConventionsSkillModal({
  draft,
  acceptedCount,
  repoName,
  onClose,
  onCreated,
}: ConventionsSkillModalProps) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const create = useCreateSkill();
  const link = useLinkAgentSkill();
  const { data: agents } = useAgents();

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>((draft.type as SkillType) ?? "convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  const [agentId, setAgentId] = React.useState("");

  const busy = create.isPending || link.isPending;
  const valid = name.trim().length > 0 && body.trim().length > 0;

  const submit = () => {
    if (!valid || busy) return;
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        body,
        // `extracted` is what marks this skill as machine-derived rather than
        // hand-written or imported.
        source: "extracted",
        enabled,
        evidence_files: draft.evidence_files,
      },
      {
        onSuccess: (skill) => {
          const done = () => {
            toast.success(t("modal.created", { name: skill.name }));
            onCreated?.();
            onClose();
          };
          // Additive link — the agent's other skills must survive.
          if (agentId) link.mutate({ agentId, skillId: skill.id }, { onSuccess: done, onError: done });
          else done();
        },
        onError: () => toast.error(t("modal.failed")),
      },
    );
  };

  return (
    <Modal
      width={860}
      title={t("modal.title")}
      subtitle={name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose} disabled={busy}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!valid} loading={busy}>
            {busy ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.banner}>{t("modal.banner", { count: acceptedCount, repo: repoName })}</div>

      <FormField label={t("modal.name")} required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>

      <FormField label={t("modal.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>

      <div style={s.row}>
        <div style={s.rowItem}>
          <FormField label={t("modal.type")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={[...SKILL_TYPES]} />
          </FormField>
        </div>
        <div style={s.rowItem}>
          <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
            <Toggle on={enabled} onChange={setEnabled} size={22} />
          </FormField>
        </div>
      </div>

      {agents && agents.length > 0 && (
        <FormField label={t("modal.agent")} hint={t("modal.agentHint")}>
          <SelectInput
            value={agentId}
            mono={false}
            onChange={setAgentId}
            options={[
              { value: "", label: t("modal.agentNone") },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </FormField>
      )}

      <FormField label={t("modal.body")} required>
        <SkillBodyEditor value={body} onChange={setBody} fileName={`${name || "skill"}.md`} dirty />
      </FormField>
    </Modal>
  );
}
