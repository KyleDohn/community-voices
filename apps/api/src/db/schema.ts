// Tables arrive with the phases that need them (see docs/DESIGN.md "Data model").
import type { LlmCall, ReportDocument, ReportSource } from '@cv/contracts';
import { sql } from 'drizzle-orm';
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { EMBEDDING_DIMENSIONS } from '../config';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const topics = pgTable('topics', {
  /** Discourse topic id. */
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  url: text('url').notNull(),
  createdAt: timestamptz('created_at').notNull(),
});

export const posts = pgTable(
  'posts',
  {
    /** Discourse post id, the upsert key. */
    id: integer('id').primaryKey(),
    topicId: integer('topic_id')
      .notNull()
      .references(() => topics.id),
    postNumber: integer('post_number').notNull(),
    username: text('username').notNull(),
    raw: text('raw').notNull(),
    createdAt: timestamptz('created_at').notNull(),
    url: text('url').notNull(),
  },
  (t) => [index('posts_topic_id_idx').on(t.topicId)],
);

export const chunks = pgTable(
  'chunks',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    /** Null until phase 2 embeds it, or after the text changed. */
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingModel: text('embedding_model'),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
  },
  (t) => [
    unique('chunks_post_chunk_uq').on(t.postId, t.chunkIndex),
    index('chunks_week_idx').on(t.weekStart),
  ],
);

export const ingestionRuns = pgTable('ingestion_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status', {
    enum: ['queued', 'running', 'succeeded', 'capped', 'failed'],
  }).notNull(),
  windowStart: timestamptz('window_start').notNull(),
  windowEnd: timestamptz('window_end').notNull(),
  maxRequests: integer('max_requests').notNull(),
  maxTokens: integer('max_tokens').notNull(),
  doneTopicIds: jsonb('done_topic_ids')
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  topicsStored: integer('topics_stored').notNull().default(0),
  postsStored: integer('posts_stored').notNull().default(0),
  chunksStored: integer('chunks_stored').notNull().default(0),
  tokensUsed: integer('tokens_used').notNull().default(0),
  error: text('error'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** One per retrieval pass (CLI or A/B run), so its rows can be grouped and counted. */
export const retrievalRuns = pgTable('retrieval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const retrievals = pgTable(
  'retrievals',
  {
    id: serial('id').primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: 'cascade' }),
    /** Null once re-ingestion drops the chunk (an edited post got shorter); the history stays. */
    chunkId: integer('chunk_id').references(() => chunks.id, { onDelete: 'set null' }),
    /** Discourse post id, the unit citations use; no FK, so the history outlives the chunk. */
    postId: integer('post_id').notNull(),
    /** The facet id, or the theme text for a trend lookup. */
    query: text('query').notNull(),
    rank: integer('rank').notNull(),
    score: doublePrecision('score').notNull(),
  },
  (t) => [index('retrievals_run_idx').on(t.runId), index('retrievals_chunk_idx').on(t.chunkId)],
);

/** One RAG report run (phase 4); jsonb holds the contract shapes from `@cv/contracts`. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed'] }).notNull(),
    retrievalRunId: uuid('retrieval_run_id').references(() => retrievalRuns.id, {
      onDelete: 'set null',
    }),
    themes: jsonb('themes')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    document: jsonb('document').$type<ReportDocument>(),
    sources: jsonb('sources')
      .$type<ReportSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    calls: jsonb('calls')
      .$type<LlmCall[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [index('reports_week_created_idx').on(t.weekStart, t.createdAt)],
);
