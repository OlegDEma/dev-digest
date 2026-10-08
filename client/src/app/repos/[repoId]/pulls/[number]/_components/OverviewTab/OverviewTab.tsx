"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
  pollWhileRunning: boolean;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, repoId, repoFullName, headSha, prBody, pollWhileRunning }: OverviewTabProps) {
  return (
    <>
      <div style={s.twoCol}>
        <IntentCard prId={prId} pollWhileRunning={pollWhileRunning} />
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
