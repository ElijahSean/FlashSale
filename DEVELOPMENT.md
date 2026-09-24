# FlashSale development guidelines

How the work runs. `CLAUDE.md` holds the rules the code must obey and `docs/design-rules.md` holds
the system rules. This file holds the process. When they disagree about a rule, `CLAUDE.md` wins.

This is a 7-day take-home (deadline **Sep 30**), so the loop is the Qahal loop with the heavy parts
removed: no phases, no task IDs beyond 01 to 07, no spec documents, shorter learnings.

---

## 1. How the work runs

**We write it together.** Claude drafts, Elijah reads every line and takes over any piece he wants
to write. Bookipi will ask him to walk through the code and change it live, so a diff approved
without being understood is a failed loop even when the tests pass. Comments are the review
surface: they explain why a line exists and name the design rule it satisfies.

**Ask in the plan, not in the diff.** If an approved plan turns out to need a decision, stop and ask.

Everything goes through the **dev loop**, the `/dev-loop` command in `.claude/commands/`:

| Step | What happens | Who |
|---|---|---|
| Detect | Hash every `requirements/*.md` against `.dev-loop/state.json`; anything changed is work. Take the lowest-numbered one | Loop |
| Scan | Read the requirement, `LEARNINGS.md`, `docs/design-rules.md`, `CLAUDE.md`, the real code | Loop |
| Plan | Files to touch, order, risks, open questions, how each criterion gets verified | Loop |
| **Gate 1** | Approve, reject or redirect the plan. Nothing is written before this | **Elijah** |
| Execute | Implement in small steps on the working tree. Test-first for 03, 04, 05 | Loop |
| Test | Full test suite plus the requirement's own expectations | Loop |
| **Gate 2** | Read the diff and results. Approve or send back | **Elijah** |
| Record | One short `LEARNINGS.md` entry, one local commit, `TASKS.md` status | Loop |
| Update state | New hash written so the requirement is not reprocessed | Loop |
| Compact | `/compact` after the commit, before the next requirement | **Elijah** |

**Two gates, no more.** Gate 1 decides what gets built, Gate 2 decides whether it is kept.

**Gates are written in plain language first.** A technical term (guard, Lua script, idempotent,
race condition) gets a short, concrete explanation the first time it appears. This doubles as
interview practice: if a gate message is hard to follow, the interview answer will be too.

**Approval is a clickable choice**, not a typed reply: "Approve", "Send back with changes", or similar.

**Three attempts per issue, then stop.** Report what was tried and wait. The cap is per issue.

**Compact between requirements, never inside one.** Anything surprising found mid-task goes into
`LEARNINGS.md` when found, not at the end.

**Push is always manual.** The loop commits locally. Creating the GitHub repo, pushing and making it
public are Elijah's steps at submission.

### Starting a run

In Claude Code, in this folder, run `/dev-loop` (or `/dev-loop 03` for a specific one). Nothing starts on its own.

---

## 2. Lining up work

The seven requirement files already exist and are the build order. Work them **in number order,
one at a time**: 01 setup, 02 sale and product config, 03 purchase gate, 04 queue and worker,
05 login and API, 06 frontend, 07 full stack and stress tests.

To add a requirement, use `/requirement-builder`. Name it `NN-kebab-case-change.md`, numbered after
the one it depends on (`03a-...` for a follow-up to 03).

**Sizing.** Right-sized means the plan fits on one screen and the diff can be read in one sitting.
Given the deadline, a requirement that looks like more than about half a day is two requirements.

**Out of scope is not optional.** Every requirement names at least two things it does not do.

---

## 3. Definition of done

A requirement is done when all of these are true:

- [ ] Every acceptance criterion is checked, by a test where a test is possible
- [ ] The tests that matter still pass: **no oversell** (N stock, many buyers, exactly N wins),
      **one per user** (one user, many parallel requests, one win), **idempotency** (a retried job
      or insert does one thing), **fail closed** (Redis down gives 503, never a fallback)
- [ ] No design rule in `docs/design-rules.md` is broken
- [ ] Comments explain why, name the rule they satisfy, and match what the code now does
- [ ] `LEARNINGS.md` has its entry, `TASKS.md` status is updated
- [ ] Elijah has read the diff and could explain it in the interview

---

## 4. Submission checklist (after 07)

- [ ] Fresh clone runs with the README steps on a clean machine
- [ ] README complete: design choices, diagram, run steps, stress test steps and results
- [ ] Create the GitHub repo, push, set it to public (manual)
- [ ] Email the link to aldo@bookipi.com (manual)
