DROP INDEX "eval_runs_one_running_per_agent";--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD COLUMN "case_revision" integer;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_per_agent" ON "eval_runs" USING btree ("agent_id") WHERE status in ('running', 'queued');