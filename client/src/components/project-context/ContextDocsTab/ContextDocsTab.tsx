/* ContextDocsTab — the Context tab body of an agent or a skill: every project
   document of the active repository as a row, attach/detach/reorder saved on
   each change, a running token estimate, and (skills) the SERIALIZES AS
   preview. One component for both owners; `variant` picks the copy. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useActiveRepo } from "../../../lib/repo-context";
import { useProjectContext, useSetContextDocs, type ContextOwnerKind } from "../../../lib/hooks/project-context";
import { useToast } from "../../../lib/toast";
import { DocPreviewDrawer } from "../DocPreviewDrawer";
import { DocRow } from "./_components/DocRow";
import {
  attachPath,
  attachedTokenSum,
  buildContextRows,
  detachPath,
  filterRows,
  moveAttached,
  moveTo,
  serializesAs,
} from "./helpers";
import { s } from "./styles";

export function ContextDocsTab({ variant, owner }: { variant: ContextOwnerKind; owner: Agent | Skill }) {
  const t = useTranslations("context");
  const toast = useToast();
  const { repoId } = useActiveRepo();
  const { data: listing, isLoading, isError, refetch } = useProjectContext(repoId);
  const save = useSetContextDocs(variant, owner.id, {
    onError: (e) => toast.error(t("tab.saveFailed", { message: e.message })),
  });

  const [query, setQuery] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [dragPath, setDragPath] = React.useState<string | null>(null);

  const attached = owner.context_docs;

  const persist = (next: string[]) => save.mutate(next);

  const rows = React.useMemo(() => (listing ? buildContextRows(listing, attached) : []), [listing, attached]);
  const shown = filterRows(rows, query);
  const visibleAttached = shown.filter((r) => r.attached);
  const visible = new Set(visibleAttached.map((r) => r.path));
  const total = listing?.total_found ?? 0;
  const heading = variant === "agent" ? t("tab.headingAgent") : t("tab.headingSkill");
  const count =
    variant === "agent"
      ? t("tab.countAgent", { attached: attached.length, total })
      : t("tab.countSkill", { attached: attached.length });

  const previewRow = previewPath ? rows.find((r) => r.path === previewPath) : undefined;

  const body = () => {
    if (!repoId) return <div style={s.state}>{t("tab.noRepo")}</div>;
    if (isLoading) return <Skeleton height={140} />;
    if (isError || !listing) return <ErrorState body={t("tab.loadError")} onRetry={() => void refetch()} />;
    if (!listing.clone_available) {
      return <EmptyState icon="Folder" title={t("page.cloneUnavailable.title")} body={t("page.cloneUnavailable.body")} />;
    }
    if (rows.length === 0) return <div style={s.state}>{t("tab.noDocs")}</div>;
    return (
      <>
        <TextInput value={query} onChange={setQuery} placeholder={t("tab.filter")} aria-label={t("tab.filter")} />
        {listing.truncated && (
          <p style={s.note}>{t("tab.truncatedNote", { shown: listing.documents.length, total })}</p>
        )}
        {shown.length === 0 ? (
          <div style={s.state}>{t("tab.noMatches", { q: query.trim() })}</div>
        ) : (
          <ul style={s.list}>
            {shown.map((row) => {
              const idx = visibleAttached.findIndex((r) => r.path === row.path);
              return (
                <DocRow
                  key={row.path}
                  row={row}
                  dragging={dragPath === row.path}
                  isFirst={idx === 0}
                  isLast={idx === visibleAttached.length - 1}
                  onToggle={(next) => persist(next ? attachPath(attached, row.path) : detachPath(attached, row.path))}
                  onPreview={() => setPreviewPath(row.path)}
                  onRemove={() => persist(detachPath(attached, row.path))}
                  onMove={(dir) => persist(moveAttached(attached, row.path, dir, visible))}
                  onDragStart={() => setDragPath(row.path)}
                  onDragEnd={() => setDragPath(null)}
                  onDrop={() => {
                    if (dragPath && dragPath !== row.path) persist(moveTo(attached, dragPath, row.path));
                    setDragPath(null);
                  }}
                />
              );
            })}
          </ul>
        )}
        <div style={s.footer}>
          <span className="tnum" style={s.total} data-testid="attached-tokens">
            {t("tab.tokensTotal", { count: attachedTokenSum(rows) })}
          </span>
          <p style={s.note}>{t("tab.untrustedNote")}</p>
        </div>
        {variant === "skill" && (
          <div style={s.serializes}>
            <span style={s.serializesLabel}>{t("tab.serializesAs")}</span>
            <pre className="mono" style={s.serializesPre}>
              {serializesAs(attached)}
            </pre>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{heading}</h2>
        {repoId && listing?.clone_available && <span style={s.count}>{count}</span>}
      </div>
      <p style={s.note}>{variant === "agent" ? t("tab.orderNote") : t("tab.inheritNote")}</p>
      {body()}
      {repoId && previewRow?.doc && (
        <DocPreviewDrawer
          repoId={repoId}
          doc={previewRow.doc}
          attached={previewRow.attached}
          onToggleAttached={(next) =>
            persist(next ? attachPath(attached, previewRow.path) : detachPath(attached, previewRow.path))
          }
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
