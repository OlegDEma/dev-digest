/* CiTab — "Continuous Integration": where this agent is installed in CI and the
   entry point to publish it. Repo names and dates come from the server and are
   rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks/core";
import { useCiInstallations } from "@/lib/hooks/ci";
import { PublishDialog } from "./_components/PublishDialog";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const installs = useCiInstallations(agent.id);
  const reposQ = useRepos();
  const [open, setOpen] = React.useState(false);

  const repos = reposQ.data ?? [];
  const list = installs.data ?? [];
  const noRepo = !reposQ.isLoading && repos.length === 0;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titles}>
          <h2 style={s.h2}>{t("ciTab.heading")}</h2>
          <div style={s.subtitle}>{t("ciTab.subtitle")}</div>
        </div>
        <div style={s.actions}>
          <Button kind="primary" disabled={repos.length === 0} onClick={() => setOpen(true)}>
            {list.length > 0 ? t("ciTab.update") : t("ciTab.publish")}
          </Button>
          {noRepo && <div style={s.hint}>{t("ciTab.noRepo")}</div>}
        </div>
      </div>

      {installs.isLoading ? (
        <div role="status" style={s.status}>
          <Icon.RefreshCw size={14} />
          {t("ciTab.loading")}
        </div>
      ) : installs.isError ? (
        <div role="alert" style={s.error}>
          {t("ciTab.loadError")}
        </div>
      ) : list.length === 0 ? (
        <div style={s.empty}>{t("ciTab.empty")}</div>
      ) : (
        <ul style={s.list}>
          {list.map((i) => (
            <li key={i.id} style={s.item}>
              {i.repo} · {t("ciTab.installed", { date: new Date(i.installed_at).toLocaleDateString() })}
            </li>
          ))}
        </ul>
      )}

      {open && <PublishDialog agent={agent} repos={repos} onClose={() => setOpen(false)} />}
    </div>
  );
}
