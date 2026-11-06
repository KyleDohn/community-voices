# Stack research: Community Voices

**Date checked:** 2026-11-06. All versions, prices and quotes below were read from primary sources on that date unless marked **[secondary]** or **[unverified]**.

**Question:** Which vector store, embedding model, LLM, 2D-projection library and judging approach should a TypeScript (pnpm) app use if it must: ingest about a week of community posts and comments (a few thousand items, 0.5–5M tokens), embed them, write a RAG "Community Voices Document" (this week plus a prediction for next week), A/B it against a no-RAG run, show a 2D embedding map, and track retrieval counts per chunk? Reviewers run it with `docker compose up` and **one** API key.

---

## 1. pgvector in Docker

- **Latest release: 0.8.7 (2026-10-01).** The CHANGELOG lists 0.9.0 as "unreleased", and it "Dropped support for Postgres 13 and 14". [CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md)
- **Official image `pgvector/pgvector`.** Tags exist for pg13 through pg18, on `-trixie` and `-bookworm` variants. The bare `pgNN` tags are bookworm, and there are version-pinned tags such as `0.8.7-pg18-trixie` and `0.8.7-pg18`. All of them were rebuilt 2026-10-31. [Docker Hub tags API](https://hub.docker.com/v2/repositories/pgvector/pgvector/tags?page_size=30), [README](https://github.com/pgvector/pgvector)
  - Suggested pin: `pgvector/pgvector:0.8.7-pg18`.
- **Enabling it:** run `CREATE EXTENSION vector;` once per database. [README](https://github.com/pgvector/pgvector)
  - You can run it from a Drizzle custom migration (Drizzle does not create the extension for you). [Drizzle guide](https://orm.drizzle.team/docs/guides/vector-similarity-search)
  - Or from an `/docker-entrypoint-initdb.d/*.sql` init script. That hook belongs to the base Postgres image. **[unverified here]**
- **Distance operators:** `<->` L2, `<#>` negative inner product, `<=>` cosine, `<+>` L1, `<~>` Hamming (bit), `<%>` Jaccard (bit). [README](https://github.com/pgvector/pgvector)
- **Dimension limits:**

  | Type        | Max stored      | Max indexed (HNSW / IVFFlat) |
  | ----------- | --------------- | ---------------------------- |
  | `vector`    | 16,000          | 2,000                        |
  | `halfvec`   | 16,000          | 4,000                        |
  | `bit`       | n/a             | 64,000                       |
  | `sparsevec` | 16,000 non-zero | 1,000 non-zero (HNSW)        |

  Source: [README](https://github.com/pgvector/pgvector). Consequence: 3072-dim models (OpenAI `-3-large`, Gemini default) need `halfvec`, or reduced dimensions, before you can index them.

- **HNSW vs IVFFlat** [README](https://github.com/pgvector/pgvector):
  - HNSW has the better speed/recall tradeoff, but builds more slowly and uses more memory. It has no training step, so you can build it on an empty table.
  - IVFFlat builds faster and uses less memory, but you must build it after loading data.
  - "By default, pgvector performs exact nearest neighbor search, which provides perfect recall."
  - **At this data size:** a few thousand to roughly 40k chunks fits an exact sequential scan in milliseconds **[unverified: no benchmark in docs]**. An index is optional. If you add one, HNSW is the safer choice because it can be created in the migration before any data exists.
  - With approximate indexes, filtering is applied _after_ the index scan. 0.8.0+ offers `hnsw.iterative_scan` for filtered queries, which matters if you filter by week or source. [README](https://github.com/pgvector/pgvector)

## 2. Node/TS access to pgvector

- **`pgvector` (pgvector-node): 0.3.1**, published 2026-11-04. MIT, maintainer ankane, `engines.node >=22`. [npm registry](https://registry.npmjs.org/pgvector/latest)
  - The README lists 14 integrations: node-postgres (`pgvector/pg`, `registerTypes`), Knex, Objection, **Kysely** (`pgvector/kysely`, with distance helpers), Sequelize, pg-promise, **Prisma** (preview `postgresqlExtensions`, `Unsupported("vector(n)")` columns and raw SQL; "`prisma migrate dev` does not support pgvector indexes"), Postgres.js, Slonik, TypeORM (0.3.27+), MikroORM, **Drizzle** ("Requires 0.31.0+", built in, also `halfvec`/`bit`/`sparsevec`), deno-postgres and Bun SQL. [pgvector-node README](https://github.com/pgvector/pgvector-node)
- **Drizzle ORM supports vectors natively:**
  - Column: `vector('embedding', { dimensions: N })` from `drizzle-orm/pg-core`.
  - Index: `index(...).using('hnsw', t.embedding.op('vector_cosine_ops'))`.
  - Prerequisites: `drizzle-orm@0.31.0` and `drizzle-kit@0.22.0`. [Drizzle guide](https://orm.drizzle.team/docs/guides/vector-similarity-search)
  - Distance helpers exported in source: `l2Distance`, `l1Distance`, `innerProduct`, `cosineDistance`, `hammingDistance`, `jaccardDistance`. [drizzle-orm/src/sql/functions/vector.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sql/functions/vector.ts)
  - 0.31.0 was published 2024-05-31. **Current `latest` is 0.45.4** (2026-10-08). The `rc` dist-tag is `1.0.0-rc.5` and `beta` is `1.0.0-beta.22`. [npm registry](https://registry.npmjs.org/drizzle-orm)
  - With Drizzle you do not need the `pgvector` npm package.

## 3. Alternatives

- **SQLite + sqlite-vec (v0.1.9, 2026-03-31).**
  - Status: "sqlite-vec is a pre-v1, so expect breaking changes!" [repo](https://github.com/asg017/sqlite-vec), [npm](https://registry.npmjs.org/sqlite-vec)
  - Usage: load it with `sqliteVec.load(db)` into better-sqlite3 or `node:sqlite` (Node 23.5+, `allowExtension: true`). [JS guide](https://alexgarcia.xyz/sqlite-vec/js.html)
  - Search: `vec0` virtual table with L2 (default), cosine and L1. The KNN docs describe brute-force search and mention no ANN index. [KNN docs](https://alexgarcia.xyz/sqlite-vec/features/knn.html) Brute force is fine at a few thousand rows.
  - **Simpler setup:** no DB container, one file.
  - **You give up:** a stable API, Drizzle's typed vector columns and helpers (you would write raw SQL against `vec0`) **[unverified whether Drizzle has any sqlite-vec support]**, and the "real Postgres" signal for reviewers.
- **Chroma (`chromadb` 3.5.0, 2026-06-30).**
  - JS needs a running server: `npx chroma run` or `docker run -p 8000:8000 chromadb/chroma`. Embedding functions ship as separate npm packages (`@chroma-core/default-embed`). [Getting started](https://docs.trychroma.com/docs/overview/getting-started)
  - Setup is about the same as Postgres (one more container).
  - **You give up:** SQL joins between posts, chunks and retrieval-count tables in one store. You would still need a database for app data. Not simpler.
- **Qdrant (`@qdrant/js-client-rest` 1.20.0, 2026-10-22).**
  - Runs as a server: `docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant`. It has a web dashboard at `:6333/dashboard`, which is nice for demos.
  - The embedded "Qdrant Edge" supports Python and Rust only. [Quickstart](https://qdrant.tech/documentation/quickstart/)
  - Same tradeoff as Chroma: an extra service, and app data still lives elsewhere.
- **LanceDB (`@lancedb/lancedb` 0.41.0, 2026-10-29).**
  - Embedded and in-process: it "runs inside your application process, with no separate database server". [docs](https://docs.lancedb.com/) `npm install @lancedb/lancedb` "will download the appropriate native library for your platform"; connect with `lancedb.connect("data/...")`. [JS docs](https://lancedb.github.io/lancedb/js/)
  - **Simpler** than Postgres for the vector part.
  - **You give up:** relational queries for app data. Native binaries also need checking for the container's arch and libc **[unverified]**.
- **Verdict:** only sqlite-vec and LanceDB remove a container. `docker compose up` already hides the Postgres container from reviewers, so the saving is small. pgvector keeps chunks, posts, runs and retrieval counts in one SQL store with typed Drizzle support.

## 4. Embedding models

**Anthropic has no embeddings API.** "Anthropic does not offer its own embedding model. One embeddings provider with a wide variety of models and capabilities is Voyage AI by MongoDB." [Claude docs: Embeddings](https://platform.claude.com/docs/en/build-with-claude/embeddings)

| Provider / model                | $ / 1M tokens | Default dims | Reducible?              | Max input | Source                                                                                                                                                        |
| ------------------------------- | ------------- | ------------ | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI `text-embedding-3-small` | $0.02         | 1536         | yes, `dimensions` param | 8,192     | [pricing](https://developers.openai.com/api/docs/pricing), [guide](https://developers.openai.com/api/docs/guides/embeddings)                                  |
| OpenAI `text-embedding-3-large` | $0.13         | 3072         | yes                     | 8,192     | same                                                                                                                                                          |
| Voyage `voyage-4-large`         | $0.12         | 1024         | 256/512/2048            | 32,000    | [Claude docs](https://platform.claude.com/docs/en/build-with-claude/embeddings), [MongoDB billing](https://www.mongodb.com/docs/voyageai/management/billing/) |
| Voyage `voyage-4`               | $0.06         | 1024         | 256/512/2048            | 32,000    | same                                                                                                                                                          |
| Voyage `voyage-4-lite`          | $0.02         | 1024         | 256/512/2048            | 32,000    | same                                                                                                                                                          |
| Gemini `gemini-embedding-2`     | $0.20 (text)  | 3072         | 128–3072 (MRL)          | 8,192     | [pricing](https://aistudio.google.com/docs/pricing), [embeddings](https://aistudio.google.com/docs/embeddings)                                                |
| Gemini `gemini-embedding-001`   | $0.15         | 3072         | 128–3072                | 2,048     | same                                                                                                                                                          |

- **OpenAI:** the pricing page lists no embedding model newer than `text-embedding-3-*`.
- **Voyage:**
  - Free tier: 200M free tokens per model for the voyage-4 family. Older models get none. [MongoDB billing](https://www.mongodb.com/docs/voyageai/management/billing/)
  - Keys are now created in MongoDB Atlas, and the endpoint is `https://ai.mongodb.com/v1/embeddings`.
  - Use `input_type: "query" | "document"`. The official TS client is npm `voyageai` 0.4.0 (2026-06-15).
  - `voyage-4-nano` is open-weight (Apache 2.0, 2048 dims) and self-hosted. Whether it runs in transformers.js is **[unverified]**. [Claude docs](https://platform.claude.com/docs/en/build-with-claude/embeddings)
- **Gemini:** both embedding models are "Free of charge" on the free tier. `gemini-embedding-2` takes no `task_type`; you use text prefixes instead. [pricing](https://aistudio.google.com/docs/pricing), [embeddings](https://aistudio.google.com/docs/embeddings)

**Local, no API key: transformers.js (`@huggingface/transformers` 4.3.2, 2026-10-27).**

- Officially runs server-side in Node (ESM or CJS, Node 20+). Models are cached on first download (`env.cacheDir`), and you can force offline use with `env.localModelPath` plus `env.allowRemoteModels = false`. [Node tutorial](https://huggingface.co/docs/transformers.js/tutorials/node)
- dtypes: `fp32`, `fp16`, `q8` (the WASM default) and `q4`. [docs](https://huggingface.co/docs/transformers.js/index)

| Model                            | Dims                        | Max seq                     | Params | ONNX q8 size | Measured CPU throughput* |
| -------------------------------- | --------------------------- | --------------------------- | ------ | ------------ | ------------------------ |
| `Xenova/all-MiniLM-L6-v2`        | 384                         | 256 word pieces (truncates) | 22.7M  | 23 MB        | ~276 texts/s             |
| `Xenova/bge-small-en-v1.5`       | 384                         | 512                         | 33.4M  | n/c          | ~155 texts/s             |
| `nomic-ai/nomic-embed-text-v1.5` | 768 (MRL to 512/256/128/64) | 8192                        | ~0.1B  | n/c          | ~44 texts/s              |

Sources: [MiniLM card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [ONNX files](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main/onnx), [bge-small card](https://huggingface.co/BAAI/bge-small-en-v1.5) (MTEB avg 62.17, query prefix "Represent this sentence for searching relevant passages:"), [nomic card](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) (needs `search_document:` / `search_query:` prefixes; MTEB 62.28 at 768 dims).

\*None of the model cards state throughput. These are **my own measurements** (2026-11-06, M1 Pro, Node 24.7, native, not in Docker): `q8`, batches of 32, about 90-word texts (roughly 110 tokens). Scaled to the corpus:

| Model     | 0.5M tokens | 5M tokens |
| --------- | ----------- | --------- |
| MiniLM    | ~17 s       | ~3 min    |
| bge-small | ~30 s       | ~5 min    |
| nomic     | ~2 min      | ~17 min   |

Docker on macOS and x86 reviewer machines may differ. gte-small was not checked.

**Ollama:** the embedding catalog includes `nomic-embed-text` (96.2M pulls), `mxbai-embed-large` (335m), `all-minilm` (22m/33m), `bge-m3` (567m), `embeddinggemma` (300m), `embeddinggemma-2`, `qwen3-embedding` (0.6b/4b/8b) and `snowflake-arctic-embed`. [ollama.com/search?c=embedding](https://ollama.com/search?c=embedding) It means an extra container plus a model pull at startup, and the npm `ollama` client is 0.6.4. It is heavier than in-process transformers.js and gains nothing at this scale.

**"One API key" options, plainly:**

1. **Claude for generation, local embeddings** (transformers.js in the app container). The only key is `ANTHROPIC_API_KEY`.
2. **OpenAI only:** `text-embedding-3-small` plus a GPT model. One `OPENAI_API_KEY`.
3. **Gemini only:** `gemini-embedding-*` plus Gemini Flash. One key, with a free tier.
4. **Claude plus Voyage:** this needs two keys (Anthropic plus MongoDB Atlas), which breaks the constraint. Offer it only as an optional upgrade.

## 5. LLM generation cost and context

**Anthropic** ([pricing](https://platform.claude.com/docs/en/about-claude/pricing), [models overview](https://platform.claude.com/docs/en/about-claude/models/overview)). Prices are per 1M tokens. All current models have a 1M context and 128K max output.

| Model (API ID)                             | Input | Output | 5m cache write | 1h cache write | Cache hit |
| ------------------------------------------ | ----- | ------ | -------------- | -------------- | --------- |
| Fable 5.1 `claude-fable-5-1`               | $10   | $50    | $12.50         | $20            | $0.25     |
| Opus 5.5 `claude-opus-5-5`                 | $4    | $20    | $5             | $8             | $0.20     |
| Sonnet 5.5 `claude-sonnet-5-5`             | $2    | $10    | $2.50          | $4             | $0.10     |
| Haiku 5.5 `claude-haiku-5-5`, prompt ≤100k | $0.10 | $0.50  | $0.125         | $0.20          | $0.01     |
| Haiku 5.5, prompt >100k                    | $0.50 | $2.50  | $0.625         | $1             | $0.05     |

- **Cache multipliers:** 5m write is 1.25x base input, 1h write is 2x, read is 0.1x. Opus 5.5 and Sonnet 5.5 reads are 0.05x.
- **Minimum cacheable prompt:** 512 tokens on current models. [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- **Batch API:** 50% off.
- **Long context:** 1M context at standard price on 4.6+ models, except Haiku 5.5, which uses the >100k tier above.
- **Tokenizer:** Claude 4.7+ produces "approximately 30% more tokens for the same text".
- **Free credits:** new users get "a small amount".

**OpenAI** ([pricing](https://developers.openai.com/api/docs/pricing), [models](https://developers.openai.com/api/docs/models)). Prices are per 1M tokens.

| Model                                               | Input | Cached input | Output | Input >272K | Output >272K |
| --------------------------------------------------- | ----- | ------------ | ------ | ----------- | ------------ |
| `gpt-6-astra` (flagship)                            | $10   | $1.00        | $50    | $20         | $75          |
| `gpt-6.1-sol`                                       | $2    | $0.10        | $10    | $4          | $15          |
| `gpt-6.1-terra`                                     | $1    | $0.05        | $5     | $2          | $7.50        |
| `gpt-6-luna` (small, "cost-sensitive, high-volume") | $0.10 | $0.01        | $0.50  | $0.20       | $0.75        |

- Context is 1.05M with 128K max output for Sol, Terra and Luna. The models page did not state Astra's context **[unverified]**.

**Google Gemini** ([pricing](https://aistudio.google.com/docs/pricing), [models](https://aistudio.google.com/docs/models)). Prices are per 1M tokens, Standard tier.

| Model                       | Input                                      | Output                | Free tier | Context    |
| --------------------------- | ------------------------------------------ | --------------------- | --------- | ---------- |
| `gemini-4-argon` (flagship) | $2 to Nov 30 2026, **$4 from Dec 1**       | $10, then **$20**     | none      | 1M         |
| `gemini-3.1-pro-preview`    | $2 (≤200k), $4 (>200k)                     | $12 / $18             | none      | n/c        |
| `gemini-3.8-flash`          | $0.75 to Dec 31 2026, **$1.50 from Jan 1** | $3.75, then **$7.50** | yes       | not stated |
| `gemini-3.5-flash-lite`     | $0.30                                      | $2.50                 | yes       | not stated |

- Argon's max output is listed as "65K / 1M" without explanation.

**Can the no-RAG baseline put the whole week in context?**

- Only at the low end. Every current frontier context window is about 1M tokens, so a 5M-token week cannot fit anywhere. Even 0.5M becomes about 0.65M on Claude's tokenizer.
- That means "no-RAG" has to be one of:
  - **(a) zero-context:** the model gets only the prompt and its prior knowledge;
  - **(b) stuffed:** the whole week, or a capped sample of about 800k tokens.
- Variant (b) costs roughly 20–40x more per run than RAG (see §Cost).

## 6. 2D embedding visualization in JS/TS

- **`umap-js` 1.4.0** (PAIR-code), last published 2024-06-05, and the last commit on the default branch is 2024-06-04. The repo is not archived (pushed_at 2026-06-15; 41 open issues+PRs per the GitHub API). [repo](https://github.com/PAIR-code/umap-js), [npm](https://registry.npmjs.org/umap-js), [GitHub API](https://api.github.com/repos/PAIR-code/umap-js)
  - API: sync `fit`, `fitAsync` with a progress callback, and step-wise `initializeFit`/`step`. Defaults are `nNeighbors` 15, `minDist` 0.1, euclidean distance.
  - It uses a random init instead of a spectral one ("comparable results for smaller datasets"). The README has no speed claims.
  - Usable, but effectively unmaintained.
- **`ml-pca` 4.1.1** (2022-11-11, mljs/Zakodium). [repo](https://github.com/mljs/pca)
- **`@saehrimnir/druidjs` 0.9.0** (2026-08-02). Actively maintained, with PCA, t-SNE, UMAP, TriMap, PaCMAP and more. The README does not state Node support explicitly **[unverified]**. [repo](https://github.com/saehm/DruidJS)
- **`tsne-js` 1.0.3** was last published in 2016. Stale; avoid it.
- **My own measurement** (M1 Pro, Node 24.7, synthetic clustered data, 3,000 points, default params):

  | Dims | umap-js 1.4.0 | ml-pca 4.1.1 (full fit) |
  | ---- | ------------- | ----------------------- |
  | 384  | 4.2 s         | 2.3 s                   |
  | 1024 | 5.5 s         | 16.8 s                  |
  | 1536 | 7.1 s         | 40.9 s                  |
  - Server-side UMAP of a few thousand vectors runs in seconds. Do it once after ingest and store the x/y coordinates in Postgres.
  - `ml-pca` gets slow at high dimensions. Also, when PCA only seeds or replaces the projection, a 384-dim local model keeps the cost low.

## 7. LLM-as-judge for A/B scoring

- **Anthropic** ([Develop tests / Grade your evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)):
  - Prefer code-based, then LLM-based grading ("Test to ensure reliability first, then scale"). Human grading is "slow and expensive. Avoid if possible."
  - Tips: "Have detailed, clear rubrics"; "Be empirical or specific" ("output only 'correct' or 'incorrect', or ... a scale of 1–5"); "Encourage reasoning" (a grader with thinking on).
  - The examples note: "Generally best practice to evaluate with a different model from the one used to generate the evaluated output".
  - The docs are **silent** on pairwise comparison and position bias.
- **OpenAI** ([Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)):
  - Describes pairwise, single-answer and reference-guided grading, and says "Use pairwise comparison or pass/fail for more reliability."
  - Names "Position bias (response order), verbosity bias (preferring longer responses)" and suggests controlling for length.
  - "Ensure eval rubrics are clear and detailed"; reason before scoring; "Use human feedback to calibrate automated scoring."
- **Implication:**
  - Run the judge on rubric-scored criteria: grounding/citation of real posts, coverage, specificity, and a falsifiable prediction.
  - Add a pairwise verdict, run twice with A/B order swapped, and count disagreement as a tie.
  - Use a different model than the generator where you can, and give the judge the retrieved evidence so it can check grounding.

---

## Cost per full run

**Run =** embed the week + 1 RAG document + 1 no-RAG document + 1 judge pass (two calls, order swapped).

**Token assumptions:**

- RAG generation: 40 chunks × ~400 tokens = 16k, plus ~2k instructions = **18k in, 3k out**.
- Zero-context baseline: **2k in, 3k out**.
- Stuffed baseline (0.5M-token week only): **0.5M in** (0.65M on Claude), 3k out.
- Judge: (two docs ~6k + rubric ~2k + evidence ~16k) ≈ 25k in, 1.5k out, × 2 = **50k in, 3k out**.
- Query embeddings: negligible.
- Thinking tokens bill as output and are **not included** (adaptive thinking is on by default for Claude). Treat these numbers as floors.

### Stack A: Claude Sonnet 5.5 + local bge-small (key: Anthropic)

| Step                             | Arithmetic                  | Cost        |
| -------------------------------- | --------------------------- | ----------- |
| Embed 0.5–5M                     | local                       | $0          |
| RAG                              | 0.018×$2 + 0.003×$10        | $0.066      |
| Zero baseline                    | 0.002×$2 + 0.003×$10        | $0.034      |
| Judge                            | 0.05×$2 + 0.003×$10         | $0.130      |
| **Total (zero baseline)**        |                             | **≈ $0.23** |
| Stuffed baseline instead (0.65M) | 0.65×$2 + 0.003×$10 = $1.33 | **≈ $1.53** |

Haiku 5.5 as the generator (RAG $0.0033, zero baseline $0.0017) with Sonnet 5.5 as the judge ($0.13) comes to **≈ $0.14**. Haiku alone for everything is about $0.01. A stuffed baseline on Haiku costs 0.65×$0.50 + 0.003×$2.50 ≈ $0.33.

### Stack B: OpenAI `text-embedding-3-small` + `gpt-6.1-sol` (key: OpenAI)

| Step                                        | Arithmetic                 | Cost              |
| ------------------------------------------- | -------------------------- | ----------------- |
| Embed                                       | 0.5×$0.02 to 5×$0.02       | $0.01–$0.10       |
| RAG                                         | 0.018×$2 + 0.003×$10       | $0.066            |
| Zero baseline                               | 0.002×$2 + 0.003×$10       | $0.034            |
| Judge                                       | 0.05×$2 + 0.003×$10        | $0.130            |
| **Total (zero baseline)**                   |                            | **≈ $0.24–$0.33** |
| Stuffed baseline instead (0.5M, >272K tier) | 0.5×$4 + 0.003×$15 = $2.05 | **≈ $2.25**       |

With `gpt-6.1-terra` the costs are half of these. With `gpt-6-luna` they are about 1/20.

### Stack C: Gemini `gemini-embedding-001` + `gemini-3.8-flash` (key: Gemini; prices valid through 2026-12-31)

| Step                            | Arithmetic                | Cost              |
| ------------------------------- | ------------------------- | ----------------- |
| Embed                           | 0.5×$0.15 to 5×$0.15      | $0.075–$0.75      |
| RAG                             | 0.018×$0.75 + 0.003×$3.75 | $0.025            |
| Zero baseline                   | 0.002×$0.75 + 0.003×$3.75 | $0.013            |
| Judge                           | 0.05×$0.75 + 0.003×$3.75  | $0.049            |
| **Total (zero baseline)**       |                           | **≈ $0.16–$0.84** |
| Stuffed baseline instead (0.5M) | 0.5×$0.75 + 0.011 = $0.39 | **≈ $0.53**       |

- These figures roughly double after Jan 1 2027.
- They could be $0 on the free tier, but free-tier rate limits and data-use terms were **not checked**.

**Takeaway:** every RAG run costs well under $1. Most of the cost comes from the stuffed baseline (if you use it) and, on hosted APIs, from embedding the corpus, which the 5M end makes worse. Cache the corpus embeddings per week so that re-runs only pay for generation.

---

## Recommendation

**Pick:**

| Layer      | Choice                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Database   | `pgvector/pgvector:0.8.7-pg18`                                                                                            |
| ORM        | Drizzle ORM 0.45.x (native `vector` + `cosineDistance`; HNSW optional)                                                    |
| Embeddings | transformers.js 4.3.2 with `Xenova/bge-small-en-v1.5` (384-dim, q8) in the app container, weights baked in at image build |
| Generator  | Claude Sonnet 5.5 (`claude-sonnet-5-5`); Haiku 5.5 as a "cheap mode" toggle                                               |
| Judge      | A different Claude tier from the generator, order-swapped pairwise plus rubric                                            |
| Projection | umap-js server-side after ingest, x/y stored in Postgres                                                                  |

- **Key:** `.env` needs only `ANTHROPIC_API_KEY`.
- **Cost:** ≈ $0.14–$0.23 per run.
- **Main tradeoff:**
  - Local 384-dim embeddings retrieve worse than Voyage or OpenAI, and the model card gives no benchmark against them.
  - Ingest costs CPU time (about 30 s to 5 min at this size).
  - The image grows by tens of MB plus `onnxruntime-node`.
  - A pluggable `EMBEDDINGS_PROVIDER=voyage` can be offered as an opt-in second key.

**Runner-up:** OpenAI only (`text-embedding-3-small` at 1536 dims, which fits `vector` indexing under 2,000, plus `gpt-6.1-terra` or `-sol`).

- One key, stronger hosted embeddings, no local model download, ≈ $0.15–$0.33 per run.
- It gives up Claude as the generator, and corpus embedding is paid per ingest.

---

## Open questions / unverified

- Whether `onnxruntime-node` (via transformers.js 4.x) works on `node:*-alpine`, or needs a glibc base such as `node:*-slim`, on both linux/amd64 and linux/arm64.
- transformers.js throughput inside Docker Desktop on macOS and on x86 reviewer hardware. My numbers are native M1 Pro only.
- Exact-scan latency in pgvector at ~40k × 384 dims (the README has no benchmark). Expected to be fine.
- Whether `voyage-4-nano` has an ONNX export usable from transformers.js. If it does, it would offer near-Voyage quality with no key.
- `gemini-3.8-flash` / `flash-lite` context windows (not on the models page), Gemini free-tier rate limits and data-use terms, and the meaning of Argon's "65K / 1M" max output.
- `gpt-6-astra` context window.
- Anthropic's docs say nothing on pairwise or position-bias mitigation. The swap-order recommendation rests on OpenAI's guidance.
- DruidJS Node support, and whether its UMAP is faster than umap-js.
- gte-small and Ollama model sizes were not read from model cards (Ollama sizes come from the catalog listing only).
- How "no-RAG" is defined: zero-context vs stuffed changes the cost by 5–10x and changes what the A/B shows. This is a product decision.
