import { Suspense } from "react";
import { AgentEvalPage } from "./_components/AgentEvalPage";

/* Route: /eval/<agentId> (per-agent eval dashboard). Thin route entry — `params` is
   awaited (Next 15); the page reads `?range=` on the client, hence the Suspense. */
export default async function Page({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return (
    <Suspense>
      <AgentEvalPage agentId={agentId} />
    </Suspense>
  );
}
