/* LineSeverityLabel — small lowercase severity word (blocker / warning /
   suggestion) at the right of a finding line; colour + icon from SEV. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, type Severity } from "@devdigest/ui";
import { lineSevLabelText } from "../styles";

export function LineSeverityLabel({ severity }: { severity: Severity }) {
  const t = useTranslations("shell");
  const I = Icon[SEV[severity].icon];
  return (
    <span style={lineSevLabelText(SEV[severity].c)}>
      <I size={12} />
      {t(`diffViewer.severity.${severity.toLowerCase()}`)}
    </span>
  );
}
