CREATE TABLE "map_points" (
	"chunk_id" integer PRIMARY KEY NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"corpus_version" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_points" ADD CONSTRAINT "map_points_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;