"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Icon, Avatar, Badge, Button, Tabs } from "@devdigest/ui";
import { RunReviewDropdown } from "../RunReviewDropdown";
import { s } from "./styles";
import type { PrDetail } from "@/lib/types";

interface PrDetailHeaderProps {
  pr: PrDetail;
  prId: string | null;
  tab: string;
  findingsCount: number;
  /** github.com PR URL; null when the repo's full_name isn't known yet. */
  githubUrl?: string | null;
  onSetTab: (tab: string) => void;
  onRunStart: () => void;
  onRunsStarted: () => void;
}

export function PrDetailHeader({
  pr,
  prId,
  tab,
  findingsCount,
  githubUrl,
  onSetTab,
  onRunStart,
  onRunsStarted,
}: PrDetailHeaderProps) {
  // Publish this sticky header's height as --pr-sticky-offset on its parent, so
  // sticky elements below it (RoleGroup headers) can pin just underneath.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const publish = () => host.style.setProperty("--pr-sticky-offset", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty("--pr-sticky-offset");
    };
  }, []);

  const handleRunStart = useCallback(() => {
    onRunStart();
  }, [onRunStart]);

  const handleRunsStarted = useCallback(() => {
    onRunsStarted();
  }, [onRunsStarted]);

  const statusColor =
    pr.status === "merged"
      ? "var(--ok)"
      : pr.status === "closed"
        ? "var(--stale)"
        : "var(--warn)";

  return (
    <div ref={rootRef} style={s.root}>
      <div style={s.titleRow}>
        <div style={s.titleCol}>
          <h1 style={s.h1}>
            <span className="mono" style={s.prNumber}>
              #{pr.number}
            </span>
            {pr.title}
          </h1>
          <div style={s.meta}>
            <span style={s.authorChip}>
              <Avatar name={pr.author} size={17} />
              {pr.author}
            </span>
            <span style={s.branchChip}>
              <Icon.GitBranch size={13} style={s.branchIcon} />
              <span className="mono" style={s.branchMono}>
                {pr.branch}
              </span>
              <Icon.ArrowRight size={11} />
              <span className="mono" style={s.branchMono}>
                {pr.base}
              </span>
            </span>
            <span className="mono tnum">
              <span style={s.addText}>+{pr.additions}</span>{" "}
              <span style={s.delText}>−{pr.deletions}</span>
            </span>
            <Badge dot bg="transparent" color={statusColor}>
              {pr.status}
            </Badge>
          </div>
        </div>
        <div style={s.actions}>
          <Button
            kind="ghost"
            size="sm"
            icon="ExternalLink"
            disabled={!githubUrl}
            onClick={() =>
              githubUrl && window.open(githubUrl, "_blank", "noopener,noreferrer")
            }
          >
            View on GitHub
          </Button>
          {prId && (
            <RunReviewDropdown
              prId={prId}
              warnMerged={pr.status === "merged" || pr.status === "closed"}
              onRunStart={handleRunStart}
              onRunsStarted={handleRunsStarted}
            />
          )}
        </div>
      </div>
      {(pr.status === "merged" || pr.status === "closed") && (
        <div style={s.staleBanner}>
          <Icon.AlertTriangle size={13} style={s.warnIcon} />
          <span>
            This PR is already {pr.status} — running a review is informational and won't affect the
            merged code.
          </span>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={onSetTab}
        pad="0"
        tabs={[
          { key: "overview", label: "Overview", icon: "FileText" },
          { key: "findings", label: "Agent runs", icon: "AlertOctagon", count: findingsCount || undefined },
          { key: "diff", label: "Files changed", icon: "Code", count: pr.files_count },
        ]}
      />
    </div>
  );
}
