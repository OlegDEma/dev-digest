/* ConfigTab — name · directive description · type · Skill body (the design's
   editor) + Enabled. `Save skill` is enabled only while the form is dirty; a
   content change bumps the version (server rule). Delete lives here too. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfirmDialog, FormField, Icon, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useSkillAgents, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { SKILL_TYPE_VALUES } from "../../../../constants";
import { SkillBodyEditor } from "../SkillBodyEditor";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const { data: agents } = useSkillAgents(skill.id);
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [touched, setTouched] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // No reset effect: the route remounts this tab via `key={skill.id}`.
  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body ||
    enabled !== skill.enabled;
  const nameError = touched && name.trim().length === 0 ? t("config.validation.nameRequired") : null;
  const bodyError = touched && body.trim().length === 0 ? t("config.validation.bodyRequired") : null;
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`card.type.${v}`) }));
  const imported = skill.source !== "manual";

  const save = () => {
    setTouched(true);
    if (name.trim().length === 0 || body.trim().length === 0) return;
    update.mutate(
      { id: skill.id, patch: { name: name.trim(), description: description.trim(), type, body, enabled } },
      { onSuccess: (saved) => toast.success(t("config.savedToast", { version: saved.version })) },
    );
  };
  const reset = () => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
    setTouched(false);
  };
  const doDelete = () => {
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deletedToast"));
        setConfirming(false);
        router.replace("/skills");
      },
    });
  };

  return (
    <div style={s.wrap}>
      {confirming && (
        <ConfirmDialog
          title={t("config.deleteTitle", { name: skill.name })}
          body={t("config.deleteConfirm", { name: skill.name, count: agents?.length ?? 0 })}
          confirmLabel={t("config.delete")}
          cancelLabel={t("config.deleteCancel")}
          loading={del.isPending}
          onConfirm={doDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge color="var(--text-secondary)" icon="GitCommit" mono>
          {t("editor.version", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      {imported && (
        <div style={s.notice} role="note">
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>{t("config.trustNotice")}</span>
        </div>
      )}

      <FormField label={t("config.name")} required hint={nameError && <span style={s.error}>{nameError}</span>}>
        <TextInput value={name} onChange={setName} placeholder={t("config.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} placeholder={t("config.descriptionPlaceholder")} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} required hint={bodyError && <span style={s.error}>{bodyError}</span>}>
        <SkillBodyEditor
          value={body}
          onChange={setBody}
          fileName={t("config.bodyFile", { name: name.trim() || skill.name })}
          dirty={body !== skill.body}
          placeholder={t("config.bodyPlaceholder")}
        />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!dirty || update.isPending} loading={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="secondary" onClick={reset} disabled={!dirty || update.isPending}>
          {t("config.cancel")}
        </Button>
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
        <div style={s.actionsRight}>
          <Button kind="danger" size="sm" icon="Trash" onClick={() => setConfirming(true)} loading={del.isPending}>
            {t("config.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
