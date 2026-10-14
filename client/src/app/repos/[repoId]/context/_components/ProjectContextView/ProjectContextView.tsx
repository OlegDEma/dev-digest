/* ProjectContextView — the Project Context page body: folder-grouped document
   list on the left, the selected document (preview / edit) on the right.
   Owns the unsaved-text guard: selecting another document or following an
   in-app link while the editor is dirty asks for confirmation first. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ConfirmDialog, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { BucketBadge } from "../../../../../../components/project-context/BucketBadge";
import { useProjectContext } from "../../../../../../lib/hooks/project-context";
import { groupByFolder } from "../../helpers";
import { DocumentPane } from "../DocumentPane";
import { useLeaveGuard } from "./useLeaveGuard";
import { s } from "./styles";

type Pending = { kind: "doc"; path: string } | { kind: "href"; href: string } | { kind: "go"; go: () => void };

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const router = useRouter();
  const { data: listing, isLoading, isError, refetch, isFetching } = useProjectContext(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);

  const onBlockedHref = React.useCallback((href: string) => setPending({ kind: "href", href }), []);
  const onBlockedGo = React.useCallback((go: () => void) => setPending({ kind: "go", go }), []);
  useLeaveGuard(dirty, onBlockedHref, onBlockedGo);

  const groups = React.useMemo(() => groupByFolder(listing?.documents ?? []), [listing]);
  const selectedDoc = listing?.documents.find((d) => d.path === selected) ?? null;

  const select = (path: string) => {
    if (path === selected) return;
    if (dirty) setPending({ kind: "doc", path });
    else setSelected(path);
  };

  const discard = () => {
    const p = pending;
    setPending(null);
    setDirty(false);
    if (p?.kind === "doc") setSelected(p.path);
    if (p?.kind === "href") router.push(p.href);
    if (p?.kind === "go") p.go();
  };

  const body = () => {
    if (isLoading) return <Skeleton height={240} />;
    if (isError || !listing) return <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />;
    if (!listing.clone_available) {
      return (
        <EmptyState icon="Folder" title={t("page.cloneUnavailable.title")} body={t("page.cloneUnavailable.body")} />
      );
    }
    if (listing.documents.length === 0) {
      return <EmptyState icon="FileText" title={t("page.empty.title")} body={t("page.empty.body")} />;
    }
    return (
      <>
        {listing.truncated && (
          <p style={s.notice}>{t("page.truncated", { shown: listing.documents.length, total: listing.total_found })}</p>
        )}
        <div style={s.layout}>
          <nav aria-label={t("title")} style={s.list}>
            {groups.map((g) => (
              <div key={g.folder}>
                <h2 className="mono" style={s.folder}>
                  {g.folder}
                </h2>
                <ul style={s.items}>
                  {g.docs.map((d) => (
                    <li key={d.path}>
                      <button
                        type="button"
                        style={s.item(d.path === selected)}
                        aria-current={d.path === selected ? "true" : undefined}
                        aria-label={d.path}
                        onClick={() => select(d.path)}
                      >
                        <span className="mono" style={s.itemName}>
                          {d.name}
                        </span>
                        <BucketBadge bucket={d.bucket} />
                        {d.estimated_tokens != null && (
                          <span className="tnum" style={s.itemMeta}>
                            {t("tokens", { count: d.estimated_tokens })}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          {selectedDoc ? (
            <DocumentPane key={selectedDoc.path} repoId={repoId} doc={selectedDoc} onDirtyChange={setDirty} />
          ) : (
            <div style={s.placeholder}>{t("page.selectDoc")}</div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <div style={s.header}>
        <div style={s.headerText}>
          <h1 style={s.h1}>{t("title")}</h1>
          <p style={s.subtitle}>{t("page.subtitle")}</p>
        </div>
        <Button kind="secondary" icon="RefreshCw" onClick={() => void refetch()} loading={isFetching && !isLoading}>
          {t("page.refresh")}
        </Button>
      </div>
      {body()}
      {pending && (
        <ConfirmDialog
          title={t("editor.confirmTitle")}
          body={t("editor.confirmBody")}
          confirmLabel={t("editor.discard")}
          cancelLabel={t("editor.keepEditing")}
          onConfirm={discard}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
