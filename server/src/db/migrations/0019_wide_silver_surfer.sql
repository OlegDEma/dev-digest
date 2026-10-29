CREATE TABLE "eval_case_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid,
	"position" integer NOT NULL,
	"case_name" text NOT NULL,
	"expectation" jsonb NOT NULL,
	"status" text NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grounded" integer DEFAULT 0 NOT NULL,
	"dropped" integer DEFAULT 0 NOT NULL,
	"summary" text NOT NULL,
	"cost_usd" double precision,
	"duration_ms" integer,
	"error" text,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_pr_number" integer;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_repo" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectation_kind" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectation_file" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectation_start_line" integer;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectation_end_line" integer;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "display_title" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "display_severity" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "display_category" text;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "progress_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "progress_total" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "config" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "case_ids" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "counts" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "strict_precision" double precision;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "macro_recall" double precision;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "macro_precision" double precision;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_case_results" ADD CONSTRAINT "eval_case_results_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_case_results_run" ON "eval_case_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eval_case_results_case" ON "eval_case_results" USING btree ("case_id","finished_at");--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_finding" ON "eval_cases" USING btree ("source_finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_owner_name" ON "eval_cases" USING btree ("owner_kind","owner_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_per_agent" ON "eval_runs" USING btree ("agent_id") WHERE status = 'running';--> statement-breakpoint
CREATE INDEX "eval_runs_agent_started" ON "eval_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "eval_runs_ws_started" ON "eval_runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_github_run_id" ON "ci_runs" USING btree ("github_run_id");