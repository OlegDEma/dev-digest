/* PublishDialog — previews the files a CI export would write (action `files`,
   re-requested whenever an option changes), warns who can read the prompt, and
   publishes with action `open_pr`. File paths/contents, repo names and error
   messages come from the server and are rendered as plain text (<pre>). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { Agent, CiPostAs, Repo } from "@devdigest/shared";
import { useExportCi } from "@/lib/hooks/ci";
import { providerKeyVar, safeHref } from "../../helpers";
import { POST_AS_OPTIONS, TRIGGER_OPTIONS } from "./constants";
import { s } from "./styles";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function PublishDialog({ agent, repos, onClose }: { agent: Agent; repos: Repo[]; onClose: () => void }) {
  const t = useTranslations("ci");
  const first = repos[0];
  const [repo, setRepo] = React.useState(first?.full_name ?? "");
  const [base, setBase] = React.useState(first?.default_branch ?? "main");
  const [postAs, setPostAs] = React.useState<CiPostAs>("github_review");
  const [triggers, setTriggers] = React.useState<string[]>([...TRIGGER_OPTIONS]);
  const preview = useExportCi(agent.id);
  const publish = useExportCi(agent.id);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  const triggersKey = triggers.join(",");
  const { mutate: requestPreview } = preview;
  // Preview = syncing with the server for the current options; writes nothing.
  React.useEffect(() => {
    if (!repo) return;
    requestPreview({ repo, base, post_as: postAs, triggers: triggersKey ? triggersKey.split(",") : [], action: "files" });
  }, [repo, base, postAs, triggersKey, requestPreview]);

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  React.useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) return e.preventDefault();
    const firstEl = items[0] as HTMLElement;
    const lastEl = items[items.length - 1] as HTMLElement;
    const active = document.activeElement;
    if (e.shiftKey && (active === firstEl || active === dialogRef.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  const onRepo = (full: string) => {
    setRepo(full);
    const r = repos.find((x) => x.full_name === full);
    if (r) setBase(r.default_branch);
  };
  const toggleTrigger = (name: string) =>
    setTriggers((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));

  const onPublish = () =>
    publish.mutate({ repo, base, post_as: postAs, triggers, action: "open_pr" });

  const published = publish.data;
  const prHref = safeHref(published?.pr_url);
  const keyVar = providerKeyVar(agent.provider);

  return (
    <div style={s.overlay}>
      <div style={s.backdrop} onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown} style={s.dialog}>
        <div style={s.header}>
          <h2 id={titleId} style={s.title}>
            {t("publishDialog.title")}
          </h2>
          <div style={s.subtitle}>{t("publishDialog.subtitle", { agentName: agent.name, repo })}</div>
        </div>

        <div style={s.body}>
          {published ? (
            <div role="status">
              <div style={s.ok}>{t("publishDialog.doneTitle")}</div>
              <div style={s.note}>{t("publishDialog.doneBody", { repo })}</div>
              <div style={s.note}>{t("publishDialog.firstPrCheckNote")}</div>
              {prHref && (
                <a href={prHref} target="_blank" rel="noopener noreferrer" style={s.link}>
                  {t("publishDialog.openPr")}
                </a>
              )}
            </div>
          ) : (
            <>
              <div style={s.note}>{t("publishDialog.intro", { repo })}</div>
              <div style={s.row}>
                <label style={s.field}>
                  <span style={s.label}>{t("publishDialog.repoLabel")}</span>
                  <select style={s.input} value={repo} onChange={(e) => onRepo(e.target.value)}>
                    {repos.map((r) => (
                      <option key={r.id} value={r.full_name}>
                        {r.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={s.field}>
                  <span style={s.label}>{t("publishDialog.postAsLabel")}</span>
                  <select style={s.input} value={postAs} onChange={(e) => setPostAs(e.target.value as CiPostAs)}>
                    {POST_AS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(`exportWizard.postAs.${o.key}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={s.field}>
                  <span style={s.label}>{t("publishDialog.baseLabel")}</span>
                  <input style={s.input} value={base} onChange={(e) => setBase(e.target.value)} />
                </label>
              </div>
              <fieldset style={{ ...s.row, border: "none", padding: 0, margin: 0 }}>
                <legend style={s.label}>{t("publishDialog.triggersLabel")}</legend>
                {TRIGGER_OPTIONS.map((name) => (
                  <label key={name} style={s.row}>
                    <input type="checkbox" checked={triggers.includes(name)} onChange={() => toggleTrigger(name)} />
                    {name}
                  </label>
                ))}
              </fieldset>

              <div>
                <div style={s.label}>{t("publishDialog.filesLabel")}</div>
                {preview.isPending ? (
                  <div role="status" style={s.note}>
                    <Icon.RefreshCw size={14} /> {t("publishDialog.generating")}
                  </div>
                ) : preview.isError ? (
                  <div role="alert" style={s.error}>
                    {t("publishDialog.previewError")} {preview.error.message}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(preview.data?.files ?? []).map((f) => (
                      <div key={f.path} style={s.file}>
                        <div style={s.filePath}>{f.path}</div>
                        <pre style={s.pre}>{f.contents}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={s.note}>{t("publishDialog.secretNote", { key: keyVar })}</div>
              <div style={s.warn}>{t("publishDialog.readability", { repo })}</div>
              <div style={s.note}>{t("publishDialog.firstPrCheckNote")}</div>
              {triggers.length === 0 && (
                <div role="status" style={s.warn}>
                  {t("publishDialog.noTrigger")}
                </div>
              )}
              {publish.isError && (
                <div role="alert" style={s.error}>
                  {publish.error.message}
                </div>
              )}
            </>
          )}
        </div>

        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {published ? t("publishDialog.close") : t("publishDialog.cancel")}
          </Button>
          {!published && (
            <Button kind="primary" onClick={onPublish} disabled={publish.isPending || !repo || triggers.length === 0 || preview.isPending || preview.isError}>
              {publish.isPending ? t("publishDialog.publishing") : t("publishDialog.publish")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
