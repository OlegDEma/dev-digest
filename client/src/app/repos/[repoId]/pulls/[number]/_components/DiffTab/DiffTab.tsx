"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { DiffViewer, type DiffCommentApi, type DiffTarget } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Deep link from the PR brief (?file=&line=); cleared via `onTargetHandled`. */
  target?: DiffTarget;
  onTargetHandled?: () => void;
}

export function DiffTab({ prId, filesCount, files, canComment, target, onTargetHandled }: DiffTabProps) {
  const tb = useTranslations("brief");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  // Exact-equal match only (AC-63): a crafted or near-miss path selects nothing.
  const targetInDiff = !!target && files.some((f) => f.path === target.path);
  const targetNonce = target?.nonce;
  // The page clears ?file= right away, so the message is kept in local state.
  const [targetMissing, setTargetMissing] = React.useState(false);
  React.useEffect(() => {
    if (targetNonce === undefined) return;
    setTargetMissing(!targetInDiff);
    if (!targetInDiff) onTargetHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNonce, targetInDiff]);

  const commentCount = comments?.length ?? 0;

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
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          commentCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          ) : undefined
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {targetMissing && (
        <div role="status" style={{ padding: "8px 0", fontSize: 13, color: "var(--text-muted)" }}>
          {tb("prBrief.notInDiff")}
        </div>
      )}
      <DiffViewer
        files={files}
        commenting={commenting}
        target={targetInDiff ? target : undefined}
        onTargetHandled={onTargetHandled}
      />
    </section>
  );
}
