/* DocRow — one row of a Context tab: drag handle, attach switch, name, folder,
   bucket badge, token estimate, Preview and keyboard reorder buttons. A path
   that is attached but absent from the repository shows "not in this
   repository" with Remove instead of the switch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { BucketBadge } from "../../../BucketBadge";
import type { ContextRow } from "../../helpers";
import { s } from "./styles";

export interface DocRowProps {
  row: ContextRow;
  dragging: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (next: boolean) => void;
  onPreview: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

export function DocRow({
  row,
  dragging,
  isFirst,
  isLast,
  onToggle,
  onPreview,
  onRemove,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
}: DocRowProps) {
  const t = useTranslations("context");
  const { path, doc, attached, absent } = row;
  const name = doc?.name ?? path.split("/").pop() ?? path;
  const folder = doc?.folder ?? path.split("/").slice(0, -1).join("/");
  const unreadable = doc != null && doc.status !== "ok";

  return (
    <li
      style={s.row(attached, dragging)}
      draggable={attached}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (attached) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <span style={s.handle} aria-label={t("tab.dragHandle", { path })} role="img">
        <Icon.Menu size={14} />
      </span>
      {absent ? (
        <Button kind="secondary" size="sm" onClick={onRemove} aria-label={t("tab.removeDoc", { path })}>
          {t("tab.remove")}
        </Button>
      ) : (
        <input
          type="checkbox"
          role="switch"
          aria-label={t("tab.attachDoc", { path })}
          checked={attached}
          disabled={unreadable && !attached}
          onChange={(e) => onToggle(e.target.checked)}
        />
      )}
      <div style={s.text}>
        <span className="mono" style={s.name}>
          {name}
        </span>
        <span className="mono" style={s.folder}>
          {folder}
        </span>
        {absent && <span style={s.absent}>{t("tab.notInRepo")}</span>}
        {unreadable && doc && <span style={s.marker}>{t(`docStatus.${doc.status}`)}</span>}
      </div>
      {doc && <BucketBadge bucket={doc.bucket} />}
      {doc?.estimated_tokens != null && (
        <span className="tnum" style={s.tokens}>
          {t("tokens", { count: doc.estimated_tokens })}
        </span>
      )}
      <div style={s.actions}>
        {attached && (
          <>
            <Button kind="ghost" size="sm" icon="ArrowUp" aria-label={t("tab.moveUp", { path })} onClick={() => onMove(-1)} disabled={isFirst} />
            <Button kind="ghost" size="sm" icon="ArrowDown" aria-label={t("tab.moveDown", { path })} onClick={() => onMove(1)} disabled={isLast} />
          </>
        )}
        {doc && (
          <Button kind="ghost" size="sm" onClick={onPreview} aria-label={t("tab.previewDoc", { path })}>
            {t("tab.preview")}
          </Button>
        )}
      </div>
    </li>
  );
}
