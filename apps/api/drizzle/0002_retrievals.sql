CREATE TABLE "retrieval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrievals" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"chunk_id" integer NOT NULL,
	"query" text NOT NULL,
	"rank" integer NOT NULL,
	"score" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retrievals" ADD CONSTRAINT "retrievals_run_id_retrieval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrievals" ADD CONSTRAINT "retrievals_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retrievals_run_idx" ON "retrievals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "retrievals_chunk_idx" ON "retrievals" USING btree ("chunk_id");