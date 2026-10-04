/* DiffTab — "Files changed": reviewer-ordered (role-grouped) diff with the
   review's findings drawn into the lines. Original order is one click away. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffAnnotationApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useSmartDiff,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { currentFindings } from "@/lib/findings";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { groupFiles, toAnnotations, filesWithFindings, findingsInFiles } from "./helpers";
import { RoleGroup } from "./_components/RoleGroup";
import { OrderToggle, type DiffOrder } from "./_components/OrderToggle";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  additions: number;
  deletions: number;
  repoFullName: string | null;
  headSha: string;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  additions,
  deletions,
  repoFullName,
  headSha,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: smart, isLoading: smartLoading, isError: smartError } = useSmartDiff(prId);
  const create = useCreatePrComment(prId);
  const action = useFindingAction();
  const { mutate: mutateFinding, isPending: pending } = action;
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  const [showComments, setShowComments] = React.useState(true);

  const findings = React.useMemo(() => currentFindings(reviews ?? []), [reviews]);
  const byId = React.useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);
  const reviewRan = (reviews ?? []).some((r) => r.kind === "review");
  // If the grouping failed to load, the flat list is what is shown — make the toggle say so.
  const effectiveOrder: DiffOrder = smartError ? "original" : order;
  const groups = effectiveOrder === "smart" ? groupFiles(files, smart) : null;
  const loadingGroups = effectiveOrder === "smart" && smartLoading;

  // Only findings on files that are actually rendered count toward the toggle.
  const visibleCount = (comments?.length ?? 0) + findingsInFiles(files, findings);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("smartDiff.postFailed"));
        throw err;
      }
    },
  };

  const annotationItems = React.useMemo(() => toAnnotations(findings), [findings]);
  const annotations = React.useMemo<DiffAnnotationApi>(
    () => ({
      items: annotationItems,
      show: showComments,
      render: (id) => {
        const f = byId.get(id);
        if (!f) return null;
        return (
          <FindingCard
            f={f}
            defaultExpanded
            pending={pending}
            repoFullName={repoFullName}
            headSha={headSha}
            onAction={(act) => {
              if (prId) mutateFinding({ findingId: id, action: act, prId });
            }}
          />
        );
      },
    }),
    [annotationItems, showComments, byId, pending, repoFullName, headSha, prId, mutateFinding],
  );

  return (
    <section>
      <SectionLabel icon="Code">{t("smartDiff.title")}</SectionLabel>
      <div style={s.subRow}>
        <span style={s.summary}>
          {t("smartDiff.summary", { files: filesCount, additions, deletions })}
        </span>
        <div style={s.controls}>
          {visibleCount > 0 && (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments", { count: visibleCount })}
            </Button>
          )}
          <OrderToggle value={effectiveOrder} onChange={setOrder} />
        </div>
      </div>
      {smartError && order === "smart" && (
        <div role="status" style={s.notice}>
          {t("smartDiff.loadFailed")}
        </div>
      )}
      {loadingGroups ? (
        <Skeleton height={160} />
      ) : groups && groups.length > 0 ? (
        <div style={s.groups}>
          {groups.map((g) => (
            <RoleGroup
              key={g.role}
              role={g.role}
              files={g.files}
              findingFiles={reviewRan ? filesWithFindings(g.files, findings) : null}
              findingCount={findingsInFiles(g.files, findings)}
              commenting={commenting}
              annotations={annotations}
            />
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} annotations={annotations} />
      )}
    </section>
  );
}
