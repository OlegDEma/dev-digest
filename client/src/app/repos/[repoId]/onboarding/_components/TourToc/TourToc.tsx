/* TourToc — "On this page": activating an entry scrolls to the section and
   moves keyboard focus to its heading. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSectionKind } from "@devdigest/shared";
import { SECTION_ORDER, sectionAnchor } from "../../constants";
import { s } from "./styles";

export function TourToc() {
  const t = useTranslations("onboarding");

  const go = (kind: OnboardingSectionKind) => {
    const el = document.getElementById(sectionAnchor(kind));
    if (!el) return;
    el.scrollIntoView?.({ behavior: "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  return (
    <nav aria-label={t("toc.label")} style={s.nav}>
      <p style={s.label}>{t("toc.label")}</p>
      <ul style={s.list}>
        {SECTION_ORDER.map((kind) => (
          <li key={kind}>
            <button type="button" style={s.item} onClick={() => go(kind)}>
              {t(`sections.${kind}`)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
