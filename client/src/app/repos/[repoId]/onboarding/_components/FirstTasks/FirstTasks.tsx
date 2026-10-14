/* FirstTasks — AI-written starter tasks with their cited files. Unavailable
   states are rendered by TourSection, never here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingFirstTaskItem } from "@devdigest/shared";
import { PATH_TRUNCATE_AT } from "../../constants";
import { middleTruncate, openFileUrl } from "../../helpers";
import { s } from "./styles";

export function FirstTasks({
  items,
  repoFullName,
  sha,
  defaultBranch,
}: {
  items: OnboardingFirstTaskItem[];
  repoFullName: string;
  sha: string | null;
  defaultBranch: string | null | undefined;
}) {
  const t = useTranslations("onboarding");

  return (
    <ul style={s.list}>
      {items.map((task) => (
        <li key={task.title}>
          <h3 style={s.title}>{task.title}</h3>
          <p style={s.rationale}>{task.rationale}</p>
          <ul style={s.paths}>
            {task.paths.map((path) => (
              <li key={path} style={s.pathRow}>
                <span className="mono" style={s.path}>
                  {middleTruncate(path, PATH_TRUNCATE_AT)}
                </span>
                <a
                  href={openFileUrl(repoFullName, sha, defaultBranch, path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("files.openLabel", { path })}
                  style={s.link}
                >
                  {t("files.open")}
                </a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
