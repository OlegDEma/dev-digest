CREATE TABLE "onboarding_generation_lock" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"lock_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_generation_lock" ADD CONSTRAINT "onboarding_generation_lock_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;