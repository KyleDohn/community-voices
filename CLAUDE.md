# Community Voices

A take-home for Transcendent Endeavors. It builds a RAG-generated weekly report on discuss.pixls.us, with an
A/B comparison against an LLM that gets no retrieval.

## Docs

- `docs/DESIGN.md` is the single source of truth for the design. Read the relevant section before building
  a feature, and update it in the same commit when a decision changes.
- `docs/ASSUMPTIONS.md` records each call made under ambiguity: what, why, and when to revisit.
- `docs/PLAN.md` gives phase order and status. Mark a phase ✅ in the commit that finishes it.
- `docs/WORKFLOW.md` is the process log. Add an entry whenever the AI was wrong and got corrected.

## Working loop

- Work **red → green → refactor**. Agree on the tested interfaces before a phase starts. Commit at each
  green, in small conventional commits (`feat(api):`, `test:`, `docs:`).
- Unit tests are `*.test.ts` next to the code. Integration tests are `*.int.test.ts` and run against real
  pgvector: `pnpm db:test:up`, then `pnpm test:integration`.
- The pre-commit hook runs lint-staged, typecheck and unit tests. CI also runs integration tests and the
  Docker build. A commit is finished when the hook passes.

## Conventions

- Every request and response DTO is a zod schema in `packages/contracts`, exported as a schema and a
  type with the same name. The web app parses every response with the schema.
- Routes live under `/api/v1`. Non-2xx bodies are `ErrorResponse`. Long-running work returns `202 { id }`,
  and the client polls for status.
- External boundaries (`ForumSource`, `Embedder`, `LlmClient`, the DB probe) are interfaces passed into
  `createApp`. Tests use fakes and fixture JSON, so unit and integration tests make no network calls. Model
  IDs and limits live in config.
- Keep functions compact and names self-documenting. A comment explains _why_, in one line.

## Gotchas

- TypeScript is pinned to 6.0.x, because typescript-eslint supports <6.1.
- `@cv/contracts` exports TS source with no build step. The API runs under `tsx` in dev and in Docker.
- The catch-all JSON 404 must stay the last route in `createApp`. Without it, unknown API paths fall
  through to the web app's `index.html`.
- The Postgres 18 image keeps data under `/var/lib/postgresql/<major>`, so the volume mounts the parent.
  Host ports are 5433 (dev) and 5434 (test).
- The API image is Debian-slim, because onnxruntime needs glibc.

## Boundaries

- `_reference/` and `.env` stay untracked. `.env.example` lists every variable.
- Push or create the GitHub remote only when the user asks.
