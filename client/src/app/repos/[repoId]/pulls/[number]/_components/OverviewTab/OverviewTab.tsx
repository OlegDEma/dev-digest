"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  pollWhileRunning: boolean;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody, pollWhileRunning }: OverviewTabProps) {
  return (
    <>
      <IntentCard prId={prId} pollWhileRunning={pollWhileRunning} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
