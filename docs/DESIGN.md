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
- `ab_runs`: id, week_start, status, the two documents (JSON), checks, judge results, token usage and cost
  per call, model IDs, `is_sample` flag.
- `retrievals`: ab_run id, chunk id, facet or query, rank, score. These rows feed the retrieval stats.
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
  for the four weeks. On boot, if `posts` is empty, the app loads the newest seed, then chunks it (and,
  from phase 2, embeds it). Other files in `seed/`, such as the sample A/B run, are never loaded as a
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

- **Model:** bge-small-en-v1.5 through `@huggingface/transformers`, giving 384 dimensions, normalized.
  Posts and queries go through the same model.
- **Model name stored:** each chunk records the model that embedded it, so changing models means
  re-embedding everything.
- **Search:** exact cosine distance (`<=>`) through Drizzle's `cosineDistance`. There's no ANN index: at
  about 6k rows an exact scan takes milliseconds, and HNSW pays off orders of magnitude later.

## Retrieval (RAG side only)

1. **Facet queries:** a configured list of queries, each limited to the target week, takes the top ~15
   each. The facets are:
   - new software releases
   - help requests and bugs
   - photo edits and critiques (Play Raw)
   - community events
   - complaints and frustrations
2. **MMR:** each facet's results are reranked with maximal marginal relevance (λ≈0.7) to keep ~8, so one
   big thread can't crowd out the rest.
3. **Merge:** duplicates are removed, leaving about 40 chunks, each labeled with its post ID for citation.
4. **Trend lookup:** after a first pass extracts the week's themes, each theme queries the three prior weeks.
   Prior-week vs current-week counts and examples become evidence for predictions.
5. **Logging:** every retrieved chunk is written to `retrievals` with its query, rank and score.

## Generation

- **Writer:** Claude Sonnet 5.5 (`claude-sonnet-5-5`) writes both documents.
- **Output:** a zod schema in `packages/contracts`, sent as a JSON schema:
  - `themes[]`: title, summary, approximate post count, `citations[]` of post IDs
  - `notableThreads[]`
  - `mood`
  - `predictions[]`: claim, rationale, confidence, `citations[]`
- **Keeping the model on task:**
  - The system prompt says to use only the supplied posts, and allows "insufficient evidence" as an answer.
  - Every call has a `max_tokens` cap.
  - zod validates the output. On failure there is one repair retry that sends the validation errors back.
- **Cost:** token usage and dollar cost are recorded per call and shown in the UI.

## A/B comparison

- **Variant A (no RAG):** the community name, a short description and the date range. No posts.
- **Variant B (RAG):** the retrieval output above.
- **Stretch variant C (paste everything in):** the whole target week in context, with no retrieval.
- **Scoring**, in three layers:
  1. **Deterministic checks.** Citations must exist in the corpus and fall inside the target week. We
     also count claims with no citation and citations to posts that weren't retrieved.
  2. **Rubric.** Claude Opus 5.5 (`claude-opus-5-5`) scores each document 1–5 on grounding, specificity,
     coverage, prediction plausibility and readability, with a short reason for each.
  3. **Blind pairwise.** The two documents are labeled X and Y, and the judge is asked twice with the order
     swapped. A disagreement counts as a tie.
- **Sample run:** one real run, labeled with its model and date, is committed in `seed/`. A reviewer sees a
  full result without an API key.

## REST API (`/api/v1`, DTOs in `packages/contracts`)

| Method | Path                       | Purpose                                              |
| ------ | -------------------------- | ---------------------------------------------------- |
| GET    | `/health`                  | Liveness, DB reachable, embedder loaded              |
| GET    | `/weeks`                   | Weeks available, with post counts                    |
| POST   | `/ingestions`              | Start ingestion → `202 { id }`                       |
| GET    | `/ingestions/:id`          | Ingestion status and counts                          |
| POST   | `/ab-runs`                 | Start an A/B run for a week → `202 { id }`           |
| GET    | `/ab-runs`                 | List runs                                            |
| GET    | `/ab-runs/:id`             | Status, both documents, checks, judge results, cost  |
| GET    | `/stats/retrievals?limit=` | Most-retrieved chunks                                |
| GET    | `/embeddings/map?runId=`   | 2D points, optionally marked with a run's retrievals |

Long-running work runs in-process. Status lives in Postgres and the client polls it.

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
