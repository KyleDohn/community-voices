CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(384),
	"embedding_model" text,
	"week_start" date NOT NULL,
	CONSTRAINT "chunks_post_chunk_uq" UNIQUE("post_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"max_requests" integer NOT NULL,
	"max_tokens" integer NOT NULL,
	"done_topic_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics_stored" integer DEFAULT 0 NOT NULL,
	"posts_stored" integer DEFAULT 0 NOT NULL,
	"chunks_stored" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" integer PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"post_number" integer NOT NULL,
	"username" text NOT NULL,
	"raw" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_week_idx" ON "chunks" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "posts_topic_id_idx" ON "posts" USING btree ("topic_id");