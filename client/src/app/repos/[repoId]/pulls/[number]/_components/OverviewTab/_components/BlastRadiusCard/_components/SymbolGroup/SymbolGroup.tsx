/* SymbolGroup — one changed symbol as a tree node: a filled header, then its callers
   (file:line → GitHub) under a guide line, plus the endpoint and cron chips reached through them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import { Badge, Button, Icon, MonoLink } from "@devdigest/ui";
import { CHIP_MAX, s } from "./styles";

interface SymbolGroupProps {
  group: DownstreamImpact;
  /** Per-symbol caller cap from the response; the "top N" hint shows when it is reached. */
  cap: number;
  defaultOpen: boolean;
  hrefFor: (file: string, line: number) => string | null;
}

export function SymbolGroup({ group, cap, defaultOpen, hrefFor }: SymbolGroupProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen);
  const [allChips, setAllChips] = React.useState(false);
  const count = group.callers.length;
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  const symbol = (
    <>
      <Icon.Code size={14} style={s.codeIcon} />
      <span className="mono" style={s.symbol}>
        {group.symbol}()
      </span>
      <span style={s.count}>{count > 0 ? t("callerCount", { count }) : t("noCallers")}</span>
    </>
  );

  if (count === 0) {
    return (
      <div style={s.group}>
        <div style={s.headerStatic}>{symbol}</div>
      </div>
    );
  }

  const endpoints = allChips ? group.endpoints_affected : group.endpoints_affected.slice(0, CHIP_MAX);
  const crons = allChips ? group.crons_affected : group.crons_affected.slice(0, CHIP_MAX);
  const hidden =
    Math.max(0, group.endpoints_affected.length - CHIP_MAX) + Math.max(0, group.crons_affected.length - CHIP_MAX);

  return (
    <div style={s.group}>
      <button type="button" style={s.header} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Chevron size={14} />
        {symbol}
      </button>
      {open && (
        <div style={s.body}>
          {group.callers.map((c, i) => {
            const href = hrefFor(c.file, c.line);
            const text = `${c.file}:${c.line}`;
            return (
              <div key={`${i}-${text}`} style={s.callerRow} title={c.name}>
                <Icon.CornerDownRight size={12} />
                {href ? <MonoLink href={href}>{text}</MonoLink> : <span className="mono">{text}</span>}
              </div>
            );
          })}
          {count === cap && <div style={s.hint}>{t("capped", { max: cap })}</div>}
          {endpoints.length > 0 && (
            <div data-testid="endpoint-chips" style={s.chips}>
              {endpoints.map((e) => (
                <Badge key={e} icon="Globe" color="var(--accent)" bg="var(--accent-bg)" mono style={s.chip}>
                  {e}
                </Badge>
              ))}
            </div>
          )}
          {crons.length > 0 && (
            <div data-testid="cron-chips" style={s.chips}>
              {crons.map((c) => (
                <Badge key={c} icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono style={s.chip}>
                  {c}
                </Badge>
              ))}
            </div>
          )}
          {hidden > 0 && !allChips && (
            <div>
              <Button size="sm" onClick={() => setAllChips(true)}>
                {t("chipsMore", { count: hidden })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
