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
   - Phase 1 (ingest): `tdd`, one vertical slice per agreed interface. Before the client was written, the
     Discourse API was checked by curling pixls. Fixtures are real trimmed responses from a re-runnable
     recorder script. Weak tests were checked by mutation: delete the guarded line and confirm exactly
     one test fails. A real four-week ingest ran against pixls and surfaced one bug the fixtures could
     not (hidden posts).

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
- Phase 1: the Discourse schema assumed every post has `raw`. The first live four-week ingest failed after
  5 topics: a post the community had flagged and hidden comes back without `raw`. The fixtures had no
  hidden post, so the tests couldn't catch it. Hidden posts are now dropped, with a test. Schema errors
  now name the URL instead of dumping zod issues, and the run was resumed from its cursor.
- Phase 1: the Docker image no longer built. The root `prepare: husky` script ran during the runtime
  stage's `--prod` install, where husky isn't installed. The bug dated from adding hooks in phase 0, after
  the last image build. It was caught by the "curl the running container" check, not by a test. The fix
  is husky's documented install guard, which skips when `NODE_ENV=production` or `CI=true`.
- Phase 1 review (subagent): found a race in the single-flight guard. Two simultaneous POSTs both started
  a run, because the slot was claimed only after an `await`. It also found that resuming a token-capped
  run did nothing, that a crash mid-seed was never repaired, and that two upsert guarantees in DESIGN
  were untested. Each was fixed red-first. One of my mutants silently failed to apply (Prettier had
  reflowed the line) and another broke the syntax, so "the tests still pass" proved nothing until a
  mutant that compiled was used.
- Open: one integration run timed out once (5 s, "adds no duplicates") right after the repository
  refactor. It didn't recur in 13 runs, and no stray DB connections were found. Cause unknown.

## Time log

| Step                | Approx. time                          |
| ------------------- | ------------------------------------- |
| Research + planning | 1 h                                   |
| Phase 0 scaffold    | 0.5 h                                 |
| Phase 1 ingest      | 0.5 h (incl. an 8-minute live ingest) |
