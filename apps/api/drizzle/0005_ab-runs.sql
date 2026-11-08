CREATE TABLE "ab_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"status" text NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"report_id" uuid,
	"no_rag_document" jsonb,
	"checks" jsonb,
	"rubric" jsonb,
	"pairwise" jsonb,
	"calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ab_runs" ADD CONSTRAINT "ab_runs_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ab_runs_created_idx" ON "ab_runs" USING btree ("created_at");