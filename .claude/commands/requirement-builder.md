---
description: Interview for a new FlashSale requirement, check overlap, and write requirements/<NN-name>.md
argument-hint: [requirement number or a short description of the change]
---

Turn `$ARGUMENTS` into a filled-out `requirements/<NN-kebab-case-name>.md`, ready for the dev loop's
Scan step. This command only writes that file. It never writes code and never changes `TASKS.md`.

Keep it quick: this is a 7-day take-home and most answers already exist in the docs.

1. **Read first:** `CLAUDE.md`, `DEVELOPMENT.md`, `docs/design-rules.md`, `LEARNINGS.md`, `TASKS.md`,
   every file in `requirements/`, and the real code if it exists.
2. **Overlap:** if an existing requirement already covers this, say so and offer to extend it instead.
3. **Dependencies:** if it depends on a requirement not yet `done` in `TASKS.md`, say so.
4. **Ask only what the docs don't answer**, in one small batch, using `AskUserQuestion` where the
   choice is Elijah's. Propose answers he can accept rather than asking open questions.
5. **Fill the template** (`requirements/_template.md`): problem and goal, scope with at least two
   out-of-scope items, acceptance criteria a test can check directly (rewrite vague ones), context,
   test expectations, notes for planning. Tick the design rule check lines it touches; delete the rest.
6. **Sizing:** if it looks like more than about half a day, or the criteria split into two
   independent groups, propose two files.
7. **Show the result:** print the path and full contents. Do not start Scan or Plan.

Never write real secrets or personal data. Use placeholders.
