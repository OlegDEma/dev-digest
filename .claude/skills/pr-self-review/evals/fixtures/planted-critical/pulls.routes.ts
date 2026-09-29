// FIXTURE (eval id 3, recall) — this file deliberately contains CRITICAL defects.
// It is NOT part of the app build. Expected gate verdict: BLOCKED.
//
// Planted defects:
//   1. onion-architecture R2 — Drizzle imported and queried directly in a route
//      (DB access must live in a repository, not the presentation ring).
//   2. onion R4 / security A01 — req.query.limit used with no Zod validation.
//   3. tripwire T2 — response maps `costUsd` but the contract field is `cost_usd`.
import type { FastifyInstance } from "fastify";
import { db } from "../../db";
import { reviews } from "../../db/schema";
import { eq } from "drizzle-orm";

export async function pullsRoutes(app: FastifyInstance) {
  app.get("/pulls/:id/runs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const limit = Number((req.query as any).limit); // unvalidated attacker input

    // Drizzle query directly in the route — onion boundary leak.
    const rows = await db
      .select()
      .from(reviews)
      .where(eq(reviews.prId, id))
      .limit(limit);

    // snake_case contract field emitted as camelCase — fails the client contract.
    return reply.send(
      rows.map((r) => ({ run_id: r.runId, costUsd: r.costUsd })),
    );
  });
}
