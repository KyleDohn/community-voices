# Workflow

This file records how the project was built with Claude Code. It is meant to be read alongside `/insights`.

## Process

1. **Research** (`research` skill). Two background subagents ran in parallel against primary sources.
   - One checked community data sources: auth, rate limits, terms, and weekly volume measured live with no
     credentials.
   - The other checked the stack: pgvector, Drizzle, embedding models, LLM pricing, UMAP, and LLM-as-judge
     guidance.
   - Output is in [`research/`](research/).
2. **Planning** (`grilling` skill). Four rounds of questions, each with a recommendation and its tradeoff.
   The developer made every call.
   - The results are [`DESIGN.md`](DESIGN.md), [`ASSUMPTIONS.md`](ASSUMPTIONS.md) and
     [`PLAN.md`](PLAN.md).
   - The developer asked for plain explanations of embeddings and retrieval during the interview. These
     were folded into `DESIGN.md` so every choice can be defended.
3. **Build** (`tdd` skill, phase by phase per `PLAN.md`).
   - Phase 0 (scaffold): `setup-pre-commit` for Husky and lint-staged, and `writing-for-agents` for the
     project `CLAUDE.md`. The health route and config loader were built test-first.

## Where the AI was wrong or needed correcting

- The research agent could not read Reddit's primary policy pages from its environment. Reddit was ruled
  out on observed behavior: 403s on unauthenticated JSON and `robots.txt: Disallow: /`. The secondary
  claims are labeled unverified, not presented as fact.
- The stack research left "what does no-RAG mean?" open as a product decision instead of guessing. That
  was the right call, and it became assumption #2.
- `typescript@latest` is now 7.0, but typescript-eslint supports <6.1. This was caught by checking peer
  deps before installing, and TypeScript was pinned to 6.0.3.
- The first server wiring let unknown `/api/v1/*` paths fall through to the SPA's `index.html` with a 200.
  This was caught by curling the running container, not by a test. A failing test came first, then the
  fix: a JSON 404 catch-all.
- Phase 1: my first plan was to skip pinned topics entirely when listing `/latest.json`. The fixture
  showed a pinned topic bumped that same day, which could hold in-window posts. The rule became "filter
  pinned topics by date, but never stop the listing on one", and a test pins it down.
- Phase 1: request pacing and the request cap went into the first Discourse slice before any test
  covered them. The tests came one slice later. To prove they weren't vacuous, each guard line was
  deleted once and exactly one test failed each time.
- Phase 1: the first "rerun adds no duplicates" integration test passed even with the upsert removed. The
  second run failed on a duplicate key, so the row counts never changed. The test now also asserts that
  the rerun succeeds, and a no-upsert mutant fails it.

## Time log

| Step                | Approx. time |
| ------------------- | ------------ |
| Research + planning | 1 h          |
| Phase 0 scaffold    | 0.5 h        |
