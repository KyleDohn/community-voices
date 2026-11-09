# Workflow

This file records how the project was built with Claude Code. It is meant to be read alongside the `/insights` report in
[`insights.html`](insights.html), which covers this project's sessions only.

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
   - Phase 4 (generate): five open questions from the handoff were settled with the developer first
     (AskUserQuestion, a recommendation on each). `claude-api` was loaded before any LLM code, and the
     SDK's own type definitions were read to confirm `zodOutputFormat` and the typed `errorCode`, rather
     than trusting memory. The Anthropic client is tested by driving the real SDK through a fake
     `fetch`; the report repository has one contract suite run against the in-memory fake and Postgres.
     The view was designed with `frontend-design` and checked in Chrome at desktop and phone widths,
     which caught a cramped cost panel. A review subagent found 13 issues (below).

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
- Phase 4: a first draft of the generator sent `z.unknown()` to the LLM client instead of the real
  schema, which would have silently turned off structured output. Caught on reading the code back;
  a test now asserts the writer call receives `ReportDocument`.
- Phase 4: the AI curled `POST /reports` on the rebuilt container to "check the no-key 503", assuming
  no key was set. `.env` (which the AI can't read) already had one, so it started an unapproved paid
  run ($0.055, which succeeded). The rule now: never use a paid endpoint as a smoke check; the no-key
  path is covered by unit tests, and every live call needs a stated cost and the user's yes.
- Phase 4: the host disk filled (3.4 GiB free), Docker's VM disk went read-only mid-build, and the
  backend process hung so a normal quit didn't free its socket. Fixed by clearing caches with the
  user and force-stopping the stale backend; the DB volumes survived.
- Phase 4 review (subagent): two real generator bugs that every test had passed. A crash after a paid
  call stored the run with no calls ($0.00 spent shown), and a reply that was all thinking sent an
  empty assistant turn into the repair, which the API rejects. Both were fixed red → green with
  mutants killed. Four React state bugs (a reload during a run showed the old report, a week switch
  could strand a starting run, first boot stuck on Loading, a stale poll error) were fixed without
  component tests, as agreed. Three doc mismatches and four clean-ups were fixed. Known gap left on
  purpose: the Report view has no automated tests.
- Phase 5: the AI's A/B tests labeled the two documents `RAG-THEME` and `NO-RAG-THEME`, so
  "contains RAG-THEME" also matched the no-RAG document. A mutant that judged the wrong document
  survived. The markers are now `THEME-ONE`/`THEME-TWO`, and each assertion also checks the other is
  absent. Separately, the AI caught by hand (before running it) a cap test whose arithmetic tripped at
  the wrong step.
- Phase 5, first live A/B run ($0.28): two of the AI's predictions were wrong. It expected the no-RAG
  writer, given the RAG writer's rules, to invent or omit citations; it returned an empty report ("no
  forum posts were supplied"), so the A/B compared RAG with nothing. With the user, variant A now writes
  from its own knowledge under the same honesty rules. It also expected all four judge calls to share
  one cache entry; the structured-output schema is part of the prefix, so rubric and pairwise each
  write their own. Measuring a real run before committing the sample caught both.
- Phase 5 review (subagent): no bug in the cost cap, blinding, order swap or checks, but five real
  gaps that every test had passed. The sample's RAG report would have shown as live output in the
  Report tab; a storage failure after a paid run recorded $0 spent; "cited posts that do not exist"
  also counted real posts older than the corpus; the A/B tab could open on a week with no run; and
  one failed poll hid a running run. The first two were fixed red → green with mutants killed, the
  rest as wording and UI fixes checked in the browser. Left on purpose: a `reports.succeed` failure
  inside an A/B run leaves that report row `running` until the next restart.
- Extra 1, Stats view: the first design drew a meter of "runs out of total runs" per post. On the real
  data every post read 7 of 7, since all dev runs cover one week, so the meter said nothing and was
  dropped for plain counts. The same check showed three rows with one title (different posts in one
  thread), which led to adding the post number to the contract. Vite also served a stale contract
  module after the change; a reload fixed it.
- Extra 1 review (subagent): no bug in ranking, the facet/trend split or the double-count exclusion.
  It found that `week_start::text` follows the session DateStyle (fixed red → green with a
  `set local datestyle` test), row types that claimed `Date` where the driver returns text, and an
  undercount if an A/B run crashes after linking its report (recorded in ASSUMPTIONS #34).
- Extra 2, embeddings map: measuring before deciding paid off three times. The plan sized each
  report's outlines by how often a run retrieved the post, but within one run that count is 1 in the
  median case (max 3), so size uses all-time distinct runs. The plan also assumed a retrieval run id
  was needed to highlight anything, but every report's sources equal its run's retrieved posts, so
  highlighting by report works for the seeded sample too. Finally, the payload estimate (548 KB) left
  out the slugged urls added later; the real response was 948 KB, which led to gzip (145 KB).
- Extra 2, tests that were wrong: a "concatenated ids" collision test used `[1, 23]` vs `[12, 3]`,
  which sort apart and never collide, so its mutant survived; `[1, 2, 3]` fixed it. A vector
  round-trip test expected float32 noise, but pgvector prints the shortest form (`0.3`). An ordering
  test passed with the ORDER BY removed, because three fresh rows come back in heap order; an UPDATE
  that moves a row to the end of the heap made it fail as it should.
- Extra 2, Map view: the hover ring was drawn in ink, the same as a report outline, so a post that
  was not in the report looked as if it were. It is now drawn in the accent color.
- Extra 2 review (subagent): two real bugs that every test had passed. The light-mode week colors
  were never emitted, because Tailwind drops `@theme` variables that only template strings reach,
  so in light mode every dot would have been black (the Chrome check ran in dark mode only). And an
  edited post kept its old map position: re-ingestion re-embeds under the same chunk id, and the
  corpus version hashed ids only. Both were fixed (the version now hashes the vectors, red → green
  with mutants killed). Also fixed: a failed refresh hid valid stored points, a no-op refresh
  flipped the map to "computing", and the tooltip assumed a fixed height.
- Phase F, fresh-clone check (subagent following only the README, no key): the Docker path and every
  number in the README matched. `pnpm dev` on a fresh clone did not: the embedder failed with "Unable
  to get model file path or buffer". `@hono/node-server` replaces the global `Response`, so
  transformers.js's `instanceof Response` check rejected the downloaded weights and never cached them.
  Docker bakes the weights in and the dev machine had them cached since phase 2, so no earlier check
  could see it. Fixed red → green (`overrideGlobalObjects: false`, with a model test that starts the
  server and loads into a cold cache). A browser pass also caught two README labels written from
  memory instead of from the UI ("Sample report", "Generate a new report").

## Time log

| Step                | Approx. time                                           |
| ------------------- | ------------------------------------------------------ |
| Research + planning | 1 h                                                    |
| Phase 0 scaffold    | 0.5 h                                                  |
| Phase 1 ingest      | 0.5 h (incl. an 8-minute live ingest)                  |
| Phase 2 embed       | 0.5 h (incl. two 2–3 minute embed runs)                |
| Phase 3 retrieve    | 0.5 h (incl. facet measurements and review fixes)      |
| Phase 4 generate    | 2 h (incl. ~30 min recovering Docker from a full disk) |
| Phase 5 A/B compare | 1.25 h (incl. two live A/B runs, $0.57)                |
| Extra 1 stats       | 0.75 h (incl. review fixes)                            |
| Extra 2 map         | 1.5 h (incl. library benchmark and review fixes)       |
| Phase F README      | 1 h (incl. fresh-clone check and the dev embedder fix) |
