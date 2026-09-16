-- Idempotent ADD: dev DBs provisioned from the full reference schema already
-- carry this column, so `IF NOT EXISTS` lets the migration record cleanly there
-- while still adding it on a canonical DB at 0009. No schema-meaning change.
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "cost_usd" double precision;