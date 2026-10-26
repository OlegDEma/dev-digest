/* TourSection — collapsible shell of one tour section: heading button
   (aria-expanded), provenance badge, and the unavailable text when the
   section has no data. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { OnboardingSection, OnboardingTour } from "@devdigest/shared";
import { sectionAnchor } from "../../constants";
import { unavailableCopyKey } from "../../helpers";
import { s } from "./styles";

export function TourSection({
  section,
  tour,
  children,
}: {
  section: OnboardingSection;
  tour: OnboardingTour;
  children?: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const anchor = sectionAnchor(section.kind);
  const bodyId = `${anchor}-body`;
  const key = unavailableCopyKey(section, tour);

  return (
    <section style={s.section} aria-labelledby={anchor}>
      <div style={s.head}>
        <h2 id={anchor} tabIndex={-1} style={s.h2}>
          <button
            type="button"
            style={s.toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            {t(`sections.${section.kind}`)}
          </button>
        </h2>
        <Badge>{t(`provenance.${section.provenance}`)}</Badge>
      </div>
      <div id={bodyId} hidden={!open} style={s.body}>
        {section.available ? (
          children
        ) : (
          <p style={s.unavailable}>{key ? t(key) : section.unavailable_reason ?? t("unavailable.generic")}</p>
        )}
      </div>
    </section>
  );
}
