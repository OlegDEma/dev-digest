/* CreatePanel — the "Create" tab: a from-scratch skill form (name · description ·
   type · body) → POST /skills. The default tab of the Add-skill modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { DEFAULT_NEW_TYPE, SKILL_TYPE_VALUES } from "../../../../constants";
import { BODY_ROWS } from "./constants";
import { s } from "./styles";

export function CreatePanel({ onCreated }: { onCreated: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_NEW_TYPE);
  const [body, setBody] = React.useState(t("create.defaultBody"));
  const [touched, setTouched] = React.useState(false);

  const bodyError = touched && body.trim().length === 0 ? t("config.validation.bodyRequired") : null;
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`card.type.${v}`) }));

  const submit = () => {
    setTouched(true);
    if (body.trim().length === 0) return;
    create.mutate(
      { name: name.trim() || t("create.defaultName"), description: description.trim(), type, body },
      {
        onSuccess: (skill) => {
          toast.success(t("create.createdToast", { name: skill.name }));
          onCreated(skill);
        },
      },
    );
  };

  return (
    <div style={s.panel}>
      <div style={s.fields}>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} mono />
        </FormField>
        <FormField label={t("create.fields.description")} hint={t("config.descriptionHint")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField
          label={t("create.fields.body")}
          required
          hint={bodyError && <span style={s.error}>{bodyError}</span>}
        >
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
      </div>
      <div style={s.primary}>
        <Button kind="primary" icon="Plus" full onClick={submit} loading={create.isPending}>
          {create.isPending ? t("create.creating") : t("create.create")}
        </Button>
      </div>
    </div>
  );
}
