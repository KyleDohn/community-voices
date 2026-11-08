CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"status" text NOT NULL,
	"retrieval_run_id" uuid,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_retrieval_run_id_retrieval_runs_id_fk" FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_week_created_idx" ON "reports" USING btree ("week_start","created_at");