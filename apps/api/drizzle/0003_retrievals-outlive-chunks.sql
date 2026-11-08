ALTER TABLE "retrievals" DROP CONSTRAINT "retrievals_chunk_id_chunks_id_fk";
--> statement-breakpoint
ALTER TABLE "retrievals" ALTER COLUMN "chunk_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "retrievals" ADD COLUMN "post_id" integer;--> statement-breakpoint
-- Hand-edited: backfill rows logged before this migration, then require the column.
UPDATE "retrievals" SET "post_id" = "chunks"."post_id" FROM "chunks" WHERE "chunks"."id" = "retrievals"."chunk_id";--> statement-breakpoint
ALTER TABLE "retrievals" ALTER COLUMN "post_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "retrievals" ADD CONSTRAINT "retrievals_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE set null ON UPDATE no action;