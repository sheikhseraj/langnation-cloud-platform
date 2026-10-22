# LangNation Lesen + Dictionary Integration — Implementation Pack

## Purpose

This pack defines how to add an interactive **Lesen / Reading Practice** module to the LangNation student portal on `https://www.langnation.com/` and connect vocabulary lookup to the existing LangNation Dictionary on `https://langnation.de/`.

The implementation must extend the existing LangNation codebase. It must **not** create a second student system, duplicate authentication, duplicate enrollment logic, or copy the Dictionary database into the main website.

## Recommended implementation order

1. Read `01_IMPLEMENTATION_SPEC.md` completely.
2. Inspect both repositories/codebases before changing anything.
3. Implement the reusable data-driven lesson renderer using `04_REUSABLE_READING_TEMPLATE.json` and `04A_EXERCISE_ANSWER_RULES.md`.
4. Load the real pilot lesson from `04_PILOT_DIE_FARBEN.json` through that same reusable renderer — never as a one-off page.
5. Implement the Dictionary bridge/API contract in `02_DATA_MODEL_AND_API.md`.
6. Implement UI according to `03_UI_UX_SPEC.md`.
7. Run the acceptance checklist in `07_ACCEPTANCE_CHECKLIST.md`.
8. Use `05_CLAUDE_CODE_PROMPT.md` if Claude Code is the main implementation agent.
9. After implementation, use `06_CODEX_REVIEW_PROMPT.md` for a second-pass review and fixes.
10. See `09_AGENT_HANDOFF.md` for exactly what to give the coding agent.

## Core architecture decision

**Recommended:** Browser on `langnation.com` calls a same-origin Student Portal endpoint. The Student Portal server then calls a read-only Dictionary API on `langnation.de`.

```text
Student Browser
   |
   | HTTPS /portal/... + /api/portal/dictionary/lookup
   v
langnation.com Student Portal
   |  - existing auth
   |  - existing enrollment
   |  - lesson/progress DB
   |
   | server-to-server HTTPS
   v
langnation.de Dictionary API
   |  - existing dictionary search/business logic
   |  - existing dictionary DB
   v
Dictionary result
```

Reasons:
- avoids cross-domain cookie/auth problems;
- avoids exposing Dictionary internals to the browser;
- keeps `langnation.de` as the source of truth;
- gives the main site a stable internal contract even if Dictionary internals change;
- makes rate limiting, caching and error handling easier.

A direct browser-to-`langnation.de` API call is acceptable only if the existing architecture strongly favors it and CORS is configured correctly.

## Non-negotiable implementation rules

- Reuse existing LangNation authentication and student enrollment.
- Reuse existing design tokens/components where available.
- Keep the Dictionary as one source of truth.
- Do not iframe the full Dictionary website into the student portal.
- Do not hardcode production secrets, API keys, DB passwords or origins.
- All lesson and exercise functionality must work responsively on desktop and mobile.
- Dictionary failure must not make the reading lesson unusable.
- Implement the pilot first, then generalize to all CEFR levels.

## Included references

- `references/dictionary_ui_reference.png` — current Dictionary UI screenshot supplied for visual reference.
- `references/3_Farben_A1_source.pdf` — source reading material supplied for the A1 pilot.
- `04_REUSABLE_READING_TEMPLATE.json` — canonical reusable content shape for all Lesen lessons.
- `04A_EXERCISE_ANSWER_RULES.md` — deterministic answer-key and publish-validation rules.
- `08_DEPLOYMENT_SEQUENCE.md` — recommended two-application release order and rollback strategy.
- `09_AGENT_HANDOFF.md` — exact files/repos to give Claude Code/Codex.
