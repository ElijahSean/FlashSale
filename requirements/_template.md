<!-- Copy to requirements/NN-kebab-case-change.md and fill in. Never edit this template in place. -->

# <Requirement title>

## Problem and goal

_What is missing or needed, and why._

## Scope

**In scope**

- 

**Out of scope**

- 

## Acceptance criteria

- [ ] 

## Context and constraints

_Files likely touched, related requirements, design rules that apply._

## Test expectations

_Existing tests that must still pass, new tests needed, manual checks._

## Notes for planning

_Known approach, open questions the plan must answer._

---

## Design rule check (delete the lines that don't apply)

Tick what this change touches so Plan reads the matching rule in `docs/design-rules.md` first.

- [ ] Touches stock or buyers → only the Lua script changes them (rules 1, 2, 3)
- [ ] Touches Redis calls → timeouts and errors return 503, never a fallback (rule 4)
- [ ] Touches the queue or worker → job id `order-<userId>`, insert is `ON CONFLICT DO NOTHING` (rule 5)
- [ ] Touches enqueue after a reservation → failure runs the release script (rule 6)
- [ ] Touches API memory or caching → no sale state in process memory except the 1 s status cache (rule 7)
- [ ] Touches a protected endpoint → identity from `req.user.id`, never the body (rule 8)
- [ ] Touches the sale window → Redis `TIME` in the script, not the API clock (rule 9)
- [ ] Touches env or config → secrets only in `.env`, product from config (rules 11, 12)
