/* BucketBadge — the bucket folder of a document as a text label with a colour.
   The label carries the meaning (colour is only an accent); an unknown bucket
   is rendered neutral because the bucket set is configurable. */
"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import { BUCKET_COLOR, NEUTRAL_BUCKET_COLOR } from "./constants";

export function BucketBadge({ bucket }: { bucket: string }) {
  const c = BUCKET_COLOR[bucket] ?? NEUTRAL_BUCKET_COLOR;
  return (
    <Badge color={c.color} bg={c.bg} mono>
      {bucket}
    </Badge>
  );
}
