# Plan

The phases are chained. Each one ends in something demoable and tested. Before each phase we agree which
interfaces to test, then work red → green → refactor and commit at each green step. Mark a phase done here
when it finishes.

Status: ⬜ not started · 🟨 in progress · ✅ done

## Core (always built)

| # | Phase | Demo at the end | Est. | Status |
|---|---|---|---|---|
| 0 | **Scaffold and guardrails.** pnpm workspace, `apps/api` (Hono), `apps/web` (Vite/React/Tailwind), `packages/contracts`, docker compose with pgvector, Drizzle migrations, `GET /health`. Husky pre-commit (Prettier, lint, typecheck, unit tests), GitHub Actions CI, project `CLAUDE.md`. | `docker compose up` → web shell shows API health is green. A commit runs the hooks. | 1 h | ⬜ |
| 1 | **Ingest.** `ForumSource` + Discourse client (fixture-tested), week window, chunking, idempotent upsert with cursor and caps, `pnpm ingest`, `POST/GET /ingestions`, seed export and load-on-empty. | `pnpm ingest` fills posts for four weeks. The seed file is committed and a fresh DB loads it. | 1.5 h | ⬜ |
| 2 | **Embed and store.** `Embedder` + bge-small built into the image, embed on boot, chunk repository with cosine search, `GET /weeks`. | `pnpm search "export crash"` returns relevant posts from a week. | 1 h | ⬜ |
| 3 | **Retrieve and log.** Facet config, MMR, merge, trend lookup, `retrievals` logging. | `pnpm retrieve --week 2026-11-02` prints ~40 diverse posts by facet. | 1 h | ⬜ |
| 4 | **Generate.** `LlmClient` (Anthropic), document schema, prompts, structured output, repair retry, cost accounting. Report view. | The Report view shows a cited RAG document for the week. | 1.5 h | ⬜ |
| 5 | **A/B compare.** No-RAG variant, citation checks, rubric and pairwise judge with order swap, `POST/GET /ab-runs` (202 + polling), A/B view, committed sample run. | "Run new A/B" → both documents side by side with scores and cost. | 1.5 h | ⬜ |

## Extras, ranked by demo value per hour

| Rank | Phase | Est. | Status |
|---|---|---|---|
| 1 | **Retrieval stats.** `GET /stats/retrievals`, Stats view with most-retrieved posts and cost per run. | 0.5 h | ⬜ |
| 2 | **Embeddings map.** UMAP on the server, cached `map_points`, `GET /embeddings/map`, canvas scatter with retrieved chunks highlighted. | 1.5 h | ⬜ |
| — | **✂️ Cut line.** Everything below is built only if time allows. | | |
| 3 | Variant C: the whole week in context, as a third A/B column. | 0.75 h | ⬜ |
| 4 | Markdown export of a document. | 0.3 h | ⬜ |
| 5 | Weekly in-process ingestion schedule. | 0.3 h | ⬜ |
| 6 | Second Discourse forum, as a config-only demo. | 0.3 h | ⬜ |

## Finish (always built)

| # | Phase | Est. | Status |
|---|---|---|---|
| F | **README polish and fresh-clone check.** Install/run steps, architecture, A/B findings, cost, licenses. A subagent follows the README from a clean clone, and we fix whatever it finds. | 0.75 h | ⬜ |
