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
   - Phase 2 (embed): `tdd` again, against interfaces agreed from a handoff note after `/clear`. One
     `Embedder` contract suite runs against both the fake and the real model, so the fake can't drift.
     Mutants (blank query prefix, dropped model and week filters, removed pass queue) each failed a test.
     The real boot was checked twice: natively against the dev DB, and in Docker on a fresh DB on a
     network with no internet access.
   - Phase 3 (retrieve): `tdd` against interfaces agreed from a handoff note, plus one more question the
     interfaces left open (what a trend "match" is). Facet wording and MMR's λ were measured on the real
     week with a scratch script before any value was chosen; the before/after is in DESIGN. The mutant
     loop, run about 14 times by now, became the project skill `.claude/skills/mutant-check` (written with
     `writing-for-agents`), with a script that refuses to count an unapplied mutant. A review subagent
     checked the phase diff against DESIGN and the Clean Code bar.

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
- Phase 2: I told the developer that leaving out bge's query prefix makes retrieval "noticeably worse".
  The first measurement, on two documents, showed no ranking difference. BAAI's v1.5 notes say the
  instruction is optional. I corrected the claim in chat, then measured on the real corpus: top-10 overlap
  was 5–8 of 10, with a modest gain for the prefix. The measured version is in DESIGN.
- Phase 2: the planned demo command, `pnpm search "export crash"`, ran `npm search` against the npm
  registry. `search` is a pnpm built-in that shadows package scripts. I had written that command into
  PLAN. The demo is now `pnpm run search`, and `CLAUDE.md` notes the collision.
- Phase 2: the first search integration test hard-coded chunk ids 1–5, but `truncate` doesn't reset a
  `serial` column. This was caught before the first run by reading the reset, and fixed with
  `restart identity`.
- Phase 2 review (subagent): found two real bugs. (1) A model with a different width would fail every
  save while `/health` said `ready`. It now fails at load. (2) The after-ingest embed held the ingestion
  slot, so a run that finished during the 2–3 minute boot embed blocked new runs with 409s. The slot is
  now freed first. It also found three surviving mutants (the queue's `.catch`, the unhandled-rejection
  guard, `countDistinct`), now covered, and unvalidated CLI flags. Fixing those flags surfaced a zod 4
  behaviour I hadn't expected: `.refine` still runs after a failed `z.iso.date()`, so `--week foo` threw
  instead of printing a usage error. Known gaps left on purpose: the `server.ts` wiring (covered by the
  live boot checks) and CLS vs mean pooling (the ranking test's margin can't tell them apart).
- Phase 3: my first `retrieveWeek` MMR test set the "different" chunk C exactly as relevant as A, so pure
  relevance ranked C above the near-duplicate B too. The test passed with MMR switched off (λ=1). The
  mutant check caught it. C is now less relevant than B, so only MMR can move it up. A second
  surviving mutant showed that no test pinned the per-facet candidate pool, so one was added.
- Phase 3 review (subagent): found one real bug. A post edited down to fewer chunks lost its
  trailing chunks on re-ingestion, and the `retrievals` cascade silently erased those rows from past
  runs. History now keeps the post id and nulls the chunk (ASSUMPTIONS #24). Three mutants survived every
  test (MMR `max` → `min`, the trend pool's sort, the log transaction); each now has a test, confirmed red
  on the mutant. It also found that trend examples weren't logged despite DESIGN saying every retrieved
  chunk is, a repeated week was double-counted, and exact ties favoured the first-listed week. Smaller
  fixes: the ambiguous top-level score on merged chunks, the log port living in the pg file, duplicated
  helpers, and the CLI logging an empty run. Known gaps left on purpose: the CLI has no tests (agreed),
  and the pg search's id tiebreak has no test of its own.
- Phase 3: a SKILL.md example I wrote paired a mutant with the wrong file. The skill's own script
  printed `NOT APPLIED` on the first dry run, which is the check it exists for.
- Phase 3: a scripted DESIGN edit replaced "from retrieval step 4 up to `## A/B comparison`" and so
  deleted the whole `## Generation` section between them. It went unnoticed for six commits and was
  caught while writing the phase-4 handoff, then restored from git. A scripted replace now needs a
  `git diff` of the doc before commit.
- Open: one integration run timed out once (5 s, "adds no duplicates") right after the repository
  refactor. It didn't recur in 13 runs, and no stray DB connections were found. Cause unknown.

## Time log

| Step                | Approx. time                                      |
| ------------------- | ------------------------------------------------- |
| Research + planning | 1 h                                               |
| Phase 0 scaffold    | 0.5 h                                             |
| Phase 1 ingest      | 0.5 h (incl. an 8-minute live ingest)             |
| Phase 2 embed       | 0.5 h (incl. two 2–3 minute embed runs)           |
| Phase 3 retrieve    | 0.5 h (incl. facet measurements and review fixes) |
