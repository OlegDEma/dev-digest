/* DocPreviewDrawer — a project document previewed in a side drawer, with its
   path, bucket, usage and token estimate. When opened from a Context tab it
   also carries the "Attached" switch for that tab's agent or skill. Escape
   closes it and focus returns to whatever opened it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Skeleton } from "@devdigest/ui";
import type { DiscoveredDocument } from "@devdigest/shared";
import { useContextDocument } from "../../../lib/hooks/project-context";
import { BucketBadge } from "../BucketBadge";
import { DocMarkdown } from "../DocMarkdown";
import { s } from "./styles";

export function DocPreviewDrawer({
  repoId,
  doc,
  attached,
  onToggleAttached,
  onClose,
}: {
  repoId: string;
  doc: DiscoveredDocument;
  /** Present only when opened from a Context tab. */
  attached?: boolean;
  onToggleAttached?: (next: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const readable = doc.status === "ok";
  const { data, isLoading, isError } = useContextDocument(repoId, doc.path, readable);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    bodyRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
    // Opener capture and listener belong to the drawer's lifetime, not onClose's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Drawer
      width={640}
      title={<span className="mono">{doc.name}</span>}
      subtitle={doc.folder || undefined}
      onClose={onClose}
    >
      <div ref={bodyRef} tabIndex={-1} style={s.body}>
        <div style={s.meta}>
          <span className="mono" style={s.path}>
            {doc.path}
          </span>
          <BucketBadge bucket={doc.bucket} />
          <span>{t("usedBy", { count: doc.used_by_agents })}</span>
          {doc.estimated_tokens != null && <span className="tnum">{t("tokens", { count: doc.estimated_tokens })}</span>}
          {onToggleAttached && (
            <label style={s.attach}>
              <input
                type="checkbox"
                role="switch"
                checked={!!attached}
                disabled={!readable}
                onChange={(e) => onToggleAttached(e.target.checked)}
              />
              {t("preview.attached")}
            </label>
          )}
        </div>
        {!readable ? (
          <div style={s.marker}>{t(`docStatus.${doc.status}`)}</div>
        ) : isLoading ? (
          <Skeleton height={160} />
        ) : isError || !data ? (
          <div role="alert" style={s.marker}>
            {t("preview.loadError")}
          </div>
        ) : (
          <DocMarkdown>{data.text}</DocMarkdown>
        )}
      </div>
    </Drawer>
  );
}
