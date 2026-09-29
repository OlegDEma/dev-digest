"use client";

/* Route-level error boundary. Next.js renders this when a Server or Client
   Component in this segment throws during render, replacing the crashed subtree
   instead of white-screening the whole app. Copy is intentionally inline (not
   i18n) so the crash screen stays robust even if a provider is what failed. */
import React from "react";
import { EmptyState } from "@devdigest/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface for local debugging; wire real logging here later.
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 28 }}>
      <EmptyState
        icon="AlertTriangle"
        title="Something went wrong"
        body="An unexpected error occurred while rendering this page. Try again, or head back to the start."
        cta="Try again"
        onCta={reset}
      />
    </div>
  );
}
