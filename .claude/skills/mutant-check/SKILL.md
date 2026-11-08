---
name: mutant-check
description: Prove a test can fail by mutating the code it guards. Use when a new test passes on its first run, after any test goes green, or when a guard (bound, filter, comparison, branch) has no failing run behind it.
---

A test that has never been seen _red_ proves nothing. Prove each guard by breaking it on purpose.

1. **List the guards** in the code under test: every bound, filter, comparison, sort direction, early return and option the agreed interface promises. Each guard gets one mutant: the smallest edit that disables it (`k: options.k` → `k: 100`, `>` → `<`, delete the `.where(...)` line).
2. **Run the mutants** with the script next to this file, one sed expression per guard. Pass the narrowest test command that covers the file:

   ```sh
   .claude/skills/mutant-check/mutate.sh apps/api/src/retrieve/mmr.ts \
     "pnpm vitest run apps/api/src/retrieve" \
     's/picked.length < k \&\& //' 's/marginal(b) > marginal(a)/marginal(b) < marginal(a)/'
   ```

   Use `pnpm test:integration <path>` for `*.int.test.ts`. The script restores the file on exit.

3. **Read every verdict.** `NOT APPLIED` means the sed pattern missed: fix the expression and rerun, because an unapplied mutant proves nothing. `SURVIVED` is a test gap: write the test that kills it (red on the mutant, green on the real code), or record why the guard needs none.
4. **Confirm the restore**: `git diff` on the source file shows only intended changes.

Done when every guard has a `killed` verdict or a written reason, and the source matches its pre-check state. Log any test that a survivor exposed as weak in `docs/WORKFLOW.md`.
