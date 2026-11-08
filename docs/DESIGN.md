# Community Voices: Design

Agreed design for the Community Voices take-home. The facts behind these choices are in
[`research/data-sources.md`](research/data-sources.md) and [`research/stack.md`](research/stack.md).
Calls we made where the brief was ambiguous are in [`ASSUMPTIONS.md`](ASSUMPTIONS.md). Build order is in
[`PLAN.md`](PLAN.md).

## What it does

The app ingests the last four weeks of posts from **discuss.pixls.us**, an open-source photography forum
built on Discourse. It produces a **Community Voices Document** for one week, covering what the community
talked about and what it will likely talk about next week. Each generation is an **A/B run**: one document
is written with RAG and one without, and both are scored side by side.

## Community and data source

- **Source:** the public Discourse JSON API, with no auth. Default limit is 200 requests/min per IP. A
  week is about 1.2k posts, about 25 requests and about 146k tokens.
- **Generic ingester:** the ingester takes any Discourse base URL. pixls is the configured default.
- **Ingestion path:** list topics with `/latest.json?order=activity`, which pages by bumped date, then fetch
  each active topic with `/t/{id}.json` and its post stream. We don't use `/posts.json`, because it returns
  fewer posts than the site reports (see the research open questions). Verified against pixls on 2026-11-06:
  - Pinned topics sort first whatever their activity, so the date cutoff skips them instead of stopping.
  - `/t/{id}.json` gives cooked HTML only. `?include_raw=true` adds the `raw` markdown, which we store.
  - It inlines the first 20 posts. `post_stream.stream` lists every post ID, and the rest come from
    `/t/{id}/posts.json?post_ids[]=…&include_raw=true`.
  - Stream IDs rise with `created_at`, so we fetch the stream from its tail and stop at the first batch
    older than the window. A long, old megathread costs one or two requests, not dozens.
  - Only `post_type` 1 (regular) is kept. 2–4 are moderator actions, small actions and whispers.
  - Posts the community flagged and hid are dropped. Discourse sends them without `raw`.
  - Category names (subcategories included) come from `/site.json`.
- **History:** four weeks. The **target week** is the latest complete Monday-to-Sunday week in UTC. It is
  what the document summarizes. The **three prior weeks** supply the trend evidence for predictions.
- **License:** posts are CC BY-NC-SA 4.0. The committed seed carries attribution and the license notice.

## Architecture

```
apps/web (Vite + React + Tailwind)  ──REST /api/v1──▶  apps/api (Hono, Node LTS)
                                                         ├─ ingest/    Discourse client → posts → chunks
                                                         ├─ embed/     Embedder (bge-small, transformers.js)
                                                         ├─ retrieve/  facet queries + MMR + trend lookup
                                                         ├─ generate/  LlmClient (Anthropic) + prompts
                                                         ├─ evaluate/  citation checks + LLM judge
                                                         └─ db/        Drizzle + Postgres/pgvector
packages/contracts (zod DTOs, shared by api and web)
```

- **Monorepo:** pnpm workspace. `docker compose up` runs Postgres (`pgvector/pgvector:0.8.7-pg18`),
  the API and the web app.
- **Images:** the API image is Debian-slim Node LTS, because onnxruntime needs glibc. The embedding model
  weights are downloaded at image build time, so first boot needs no network for embeddings.
- **Secrets:** `.env` needs only `ANTHROPIC_API_KEY`.

### Boundaries (interfaces with fakes in tests)

| Interface     | Real implementation                           | Test fake                    |
| ------------- | --------------------------------------------- | ---------------------------- |
| `ForumSource` | Discourse HTTP client                         | Recorded fixture JSON        |
| `Embedder`    | transformers.js bge-small-en-v1.5 (384-d, q8) | Deterministic hash-to-vector |
| `LlmClient`   | Anthropic Messages API                        | Scripted responses           |

Model IDs and limits live in config, not in code.

## Data model (Postgres)

- `topics`: Discourse topic id, title, category, url, created_at.
- `posts`: Discourse post id (upsert key), topic id, author username, raw text, created_at, url.
- `chunks`: id, post id, chunk index, text (topic title and category added in front), `embedding vector(384)`,
  `embedding_model`, `week_start`.
- `ingestion_runs`: id, status, cursor, counts, request and token caps, timestamps, error.
- `reports`: id, week_start, status, retrieval_run id, extracted themes, the document (JSON), the sources
  in its context (post id, url, topic title, week), usage and cost per call, error code and message,
  timestamps. One row per RAG report run.
- `ab_runs`: id, week_start, status, the RAG report it generated, the no-RAG document (JSON), checks,
  judge results, token usage (cache writes and reads included) and cost per call, model IDs, error code
  and message, timestamps, `is_sample` flag.
- `retrieval_runs`: id, week_start, created_at. One row per retrieval (the CLI demo included); phase 5's
  `ab_runs` points to one.
- `retrievals`: retrieval_run id, chunk id (null once re-ingestion drops the chunk), post id, facet or
  query, rank, score. These rows feed the retrieval stats.
- `map_points`: chunk id, x, y, corpus version. This is the cached UMAP projection.

## Ingestion

- **Idempotent:** posts upsert by Discourse post ID, and chunks upsert on `(post_id, chunk_index)`. A chunk
  keeps its embedding only while its text is unchanged, so a re-run doesn't force a re-embed.
- **Resumable:** a run's cursor is the set of finished topic IDs. It isn't a position in the list, because
  `/latest` reorders whenever someone posts. `pnpm ingest --resume <id>` continues a capped or failed run.
- **Caps:** each run has caps on requests and total tokens (about chars/4 of raw text). Hitting either ends
  the run as `capped`, with its cursor kept. Caps cover the whole run, so a resume continues only under
  raised caps, which `--resume` reads from the current config. That, plus chunking and dropping noise, is our answer to
  overly large data.
- **Pacing:** a polite User-Agent naming the project, and 600 ms between requests (half the default
  limit). robots.txt is fetched once per run from the host root, and every request is checked against
  it, `*` wildcards included. A disallowed path fails the run instead of being fetched.
- **Triggers:** the CLI (`pnpm ingest`), `POST /api/v1/ingestions`, and a weekly in-process schedule
  (stretch). The API runs one ingestion at a time per process and answers `409` while one is in flight.
- **Seed:** `seed/<host>-<from>-<to>.json` (written by `pnpm seed:export`) holds the raw topics and posts
  for the four weeks. On boot, if `posts` is empty, the app loads the newest seed, chunks it and embeds it. Other files in `seed/`, such as the sample A/B run, are never loaded as a
  corpus.

### Chunking

- One post is one chunk, with `"<topic title> [<category>]"` added in front.
- Posts over about 400 tokens are split with a small overlap.
- Posts under about 15 words are dropped unless they are the first post of a topic. An image-only opening
  post becomes a chunk of just its title, so the topic can still be found.
- `[quote]` blocks and image embeds are stripped before counting and embedding. A quote repeats another
  post, so keeping it would let a one-line reply pass the word floor and duplicate that post in search.
- Limits are in words, not tokens: 300 words (about 400 tokens) per chunk with a 40-word overlap. The
  chunker needs no tokenizer that way, and it stays under bge-small's 512-token input limit.

## Embeddings

- **Model:** bge-small-en-v1.5 (`Xenova/bge-small-en-v1.5`) through `@huggingface/transformers`. It gives
  384 dimensions with CLS pooling, normalized to unit length, so cosine similarity is a plain dot product.
  The weights are q8 (8-bit), 34 MB instead of about 130 MB, and faster on CPU with little loss in quality.
- **Posts vs queries:** `Embedder` has `embedDocuments` and `embedQuery`. Only queries get bge's
  instruction, `"Represent this sentence for searching relevant passages: "`. Measured on the week of
  2026-10-26, top-10 with and without the prefix overlapped 5–8 of 10 across five facet-style queries;
  where they differed, the prefixed run tended to surface the more on-topic posts (a release
  announcement for "new software releases"). We keep it, as the model card recommends.
- **Model name stored:** each chunk records the model that embedded it. Search compares only vectors from
  the current model, and changing `EMBEDDING_MODEL` re-embeds everything on the next boot. The new model
  must output 384 dimensions (the `chunks.embedding` width); the embedder checks this at load and reports
  `failed` otherwise, since a wider model needs a migration.
- **When it runs:** on boot, after seeding, in the background; the API answers meanwhile, `/health` says
  `embedder: loading`, and `/weeks` shows `embedded` climbing. After each ingestion run (API or CLI) the
  pending chunks are embedded, once the run has freed its slot. Passes are serialized and embed only pending chunks, so a reboot is a no-op. The full
  seed (3,402 chunks) takes about 2 minutes natively and 2.7 minutes in Docker on an M-series Mac.
- **Image:** the Docker build downloads the weights into `/app/models` and sets
  `EMBEDDING_ALLOW_REMOTE=false`. First boot was verified on a network with no internet access.
- **Search:** exact cosine distance (`<=>`) through Drizzle's `cosineDistance`, within one week, scored
  `1 - distance`. There's no ANN index: at about 3.4k rows an exact scan takes milliseconds, and HNSW pays
  off orders of magnitude later.
- **Reading scores:** bge similarities bunch up (top hits for "export crash" were 0.67–0.70), so only the
  ranking is meaningful. Don't filter on an absolute score threshold.

## Retrieval (RAG side only)

1. **Facet queries:** a configured list of facets (`apps/api/src/retrieve/facets.ts`), each with a label for
   people and a full-sentence query for bge. Each query is limited to the target week and takes the 15
   nearest chunks. The facets are new software releases, help requests and bugs, photo edits and
   critiques (Play Raw), community events, and complaints and frustrations.
   - **Wording, measured on the week of 2026-10-26:** a query should describe the _kind of post_, not the
     products in it. "A new version of darktable, RawTherapee, GIMP…" returned 6 topics in 8 chunks, 3 of
     them from a darktable colour-issues thread that only mentioned the tools. "Announcing a new release:
     version 2.0 is out, with new features, a changelog and download links" returned 8 topics, mostly
     real release threads. For events, a "community photo challenge" query found a second challenge
     thread the generic "meetup, workshop, conference…" query missed. pixls has few real events, so
     that facet is thin in most weeks. A "rant" wording for frustrations did worse (3 topics), so the
     first wording stayed.
2. **MMR:** each facet's 15 candidates are reranked with maximal marginal relevance to keep 8, so one big
   thread can't crowd out the rest. Each pick maximizes `λ·relevance − (1−λ)·(max similarity to the
chunks already picked)`. Measured on 2026-10-26, distinct topics among the ~39 merged chunks: 20 at
   λ=1 (no MMR), 27 at λ=0.7, 28 at 0.5 and 0.3. We use 0.7. Lower values barely help, because MMR can
   only choose among the 15 candidates.
3. **Merge:** a chunk found by several facets appears once and keeps every facet label, leaving about 40
   chunks, each labeled with its post ID for citation.
4. **Trend lookup:** each theme (from the LLM's first pass in phase 4; the CLI demo uses the facet
   queries) is matched against the target week and the three prior weeks. A "match" is rank-based, since
   bge scores are too bunched for a threshold: the 40 chunks nearest the theme across all four weeks are
   pooled, and each week's count is its share of them, with its top 3 as examples. What the numbers can
   support: "this theme is more concentrated in this week than before", as a hint for a prediction. What
   they can't: absolute volume (a week with more chunks wins more of the pool; our four weeks hold 733–928 chunks, so
   the skew is small), significance (a 40-chunk
   pool is noisy, so a 12 vs 9 split means nothing), or that the matches are on topic (the examples are
   there to check). Wording alone moves the numbers: rewording the release query changed its split from
   23/6/7/4 to 8/11/3/18, because the first wording was really tracking darktable discussion.
5. **Logging:** each retrieval creates a `retrieval_runs` row, and every retrieved chunk is written to
   `retrievals` with the facet (or theme), rank and score. A chunk found by two facets gets two rows.

## Generation

- **Writer:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) writes both documents.
- **A RAG report is two calls** (`generateReport`):
  1. **Extract themes.** Claude Haiku 5.5 (`claude-haiku-5-5`, effort `low`) reads the ~40 retrieved
     chunks and names 4–6 themes, each as one sentence that works as a search query.
  2. **Trend lookup** (Retrieval step 4) runs each theme over the target week and the three before it,
     and the retrieval run is logged (facet picks plus trend examples). Logging comes before the write,
     so stats count what was retrieved even when writing fails.
  3. **Write.** Sonnet 5.5 (effort `medium`) gets the chunks, each labeled `[post 12345]`, plus each
     theme's weekly counts with its example posts, and returns the document.
  4. **Validate**, and repair once if needed.
- **Output:** a zod schema in `packages/contracts` (`ReportDocument`), sent as structured output
  (`output_config.format` via the SDK's `zodOutputFormat`). The API guarantees the JSON shape; limits it
  can't enforce (min/max) are stripped by the SDK and checked on our side.
  - `themes[]`: title, summary, approximate post count, `citations[]` of post IDs
  - `notableThreads[]`: title, why it stands out, `citations[]`
  - `mood`: summary, `citations[]`
  - `predictions[]`: claim, rationale, confidence (`low | medium | high`), `citations[]`
  - Citations may be empty in the schema, because the no-RAG variant has nothing to cite. Uncited claims
    are counted in phase 5, not rejected.
- **What a citation may point to** (`validateGrounding`, RAG only): theme, thread and mood citations must
  be target-week posts that were in the context. Prediction citations may also point to the prior-week
  trend examples, since those are the evidence for a trend. Phase 5's "inside the target week" check
  applies this same split.
- **Keeping the model on task:**
  - The system prompt says to use only the supplied posts, and allows "insufficient evidence" as an answer.
  - Trend counts are presented as hints, with their examples to check, and the prompt asks for `low` or
    `medium` confidence unless the examples back a prediction up (Retrieval step 4 says why).
  - zod and `validateGrounding` check the output. On failure (bad JSON, cut off at `max_tokens`, a
    broken limit, a citation outside the context) there is **exactly one** repair call that sends the
    errors back. A second failure fails the run: it usually means a prompt problem, and looping would
    multiply cost. A refusal stops the run with no repair.
- **Cost guards:**
  - Every call has a `max_tokens` cap from config, sized per step (extract 2,000, write 8,000); a repair
    reuses its step's cap. It covers thinking tokens too, so a reply can stop with no text at all.
  - A failure after a paid call (a crash, a refusal, a cap) still stores the calls already made, so a
    failed run shows what it cost.
  - **Per-run cap** (`MAX_RUN_COST_USD`, default $0.50; a report run costs about $0.03–0.08). An A/B run
    has its own cap over all of its calls (see A/B comparison). Before each
    call, the run adds its spend so far to that call's worst case (estimated input plus `max_tokens` at
    the output price). If that exceeds the cap, the run stops as `cost_cap_exceeded` before the call.
  - **Spend limits stop the run.** The Console workspace limit (HTTP 400, "You have reached your specified
    … API usage limits") and the tier cap (HTTP 429, `enforced_spend_limit_reached`) become
    `spend_limit_reached`, with no repair. The SDK's `maxRetries` is 1, so a 429 costs at most one more
    rejected (free) request.
- **Cost:** `costOf(usage, model, prices)` uses a price table in config. Token usage and dollar cost are
  recorded per call and shown in the UI.

## A/B comparison

- **Variant A (no RAG):** the community name, a short description and the date range. No posts. It is
  told it has no posts and writes from what it knows, with the same schema and honesty rules (cite only
  real ids it knows, never invent). Given the RAG writer's "use only the supplied posts" rule instead, it
  returned an empty report, which made the comparison say nothing.
- **Variant B (RAG):** the retrieval output above.
- **Stretch variant C (paste everything in):** the whole target week in context, with no retrieval.
- **Scoring**, in three layers:
  1. **Deterministic checks.** Citations must exist in the corpus and fall inside the target week. We
     also count claims with no citation and citations to posts that weren't retrieved.
  2. **Rubric.** Claude Opus 5.5 (`claude-opus-5-5`) scores each document 1–5 on grounding, specificity,
     coverage, prediction plausibility and readability, with a short reason for each. Each document is
     scored on its own, never named as RAG or no-RAG.
  3. **Blind pairwise.** The two documents are labeled X and Y, and the judge is asked twice with the order
     swapped. A disagreement counts as a tie. Judges favor the first answer they read (position bias);
     swapping cancels it, and a verdict that flips with the order was decided by position, not content.
- **One run, fresh inputs.** An A/B run generates its own RAG report (a `reports` row the `ab_runs` row
  points to), then the no-RAG document, so both come from the same moment.
- **The judge's evidence.** Every judge call gets the target-week posts the RAG writer read, as `[post N]`
  blocks, as the reference for both documents. Without them "grounding" means "sounds plausible", which
  no-RAG is good at. This favors RAG by construction, because it is RAG's own context; the README says so.
- **Cost.** The judge's system prompt (instructions plus evidence, about 16k tokens) is the same in all
  four calls and is prompt-cached. The structured-output schema is part of the cached prefix, so the
  rubric and the pairwise calls each keep their own entry: the first call of each writes it (1.25x), the
  second reads it (0.05x on Opus 5.5). The whole run shares one spend total under `MAX_AB_RUN_COST_USD`
  (default $1.50). The first live run cost $0.28 and took under a minute.
- **Sample run:** one real run, labeled with its model and date, is committed in `seed/`. A reviewer sees a
  full result without an API key.

## REST API (`/api/v1`, DTOs in `packages/contracts`)

| Method | Path                       | Purpose                                              |
| ------ | -------------------------- | ---------------------------------------------------- |
| GET    | `/health`                  | Liveness, DB reachable, embedder loaded              |
| GET    | `/weeks`                   | Weeks with posts, chunks and embedded counts         |
| POST   | `/ingestions`              | Start ingestion → `202 { id }`                       |
| GET    | `/ingestions/:id`          | Ingestion status and counts                          |
| POST   | `/reports`                 | Generate the RAG report for a week → `202 { id }`    |
| GET    | `/reports?week=`           | List report runs, newest first                       |
| GET    | `/reports/:id`             | Status, document, sources, cost per call             |
| POST   | `/ab-runs`                 | Start an A/B run for a week → `202 { id }`           |
| GET    | `/ab-runs`                 | List runs                                            |
| GET    | `/ab-runs/:id`             | Status, both documents, checks, judge results, cost  |
| GET    | `/stats/retrievals?limit=` | Most-retrieved chunks                                |
| GET    | `/embeddings/map?runId=`   | 2D points, optionally marked with a run's retrievals |

Long-running work runs in-process. Status lives in Postgres and the client polls it.

`/health` is the one exception to "non-2xx bodies are `ErrorResponse`": its 503 still carries a
`HealthResponse`, so a client can see which dependency is down.

## UI

The app has a week selector, a "Run new A/B" button and four views:

1. **Report:** the RAG document, with links to the cited posts on the forum.
2. **A/B:** both documents side by side, with checks, rubric scores and judge reasoning.
3. **Map:** a UMAP scatter on canvas. Points are colored by week. A selected run's retrieved chunks are
   outlined and sized by how often they've been retrieved, and hovering shows the post.
4. **Stats:** the most-retrieved posts, and the cost of each run.

## Testing and CI

- **Unit (Vitest, pre-commit):** chunking, the week window, MMR, citation checks, cost math, prompt
  assembly and the DTO schemas.
- **Integration (`pnpm test:integration`, CI):** real pgvector from compose. Covers the repositories,
  ingestion upsert and cursor, and retrieval ordering.
- **No live calls in tests.** One opt-in smoke test makes a real LLM call.
- **CI:** GitHub Actions runs format check, lint, typecheck, unit tests and integration tests (with a
  pgvector service container).

## Licensing

Code is under MIT. `seed/` is under CC BY-NC-SA 4.0, with attribution to discuss.pixls.us and its authors.
