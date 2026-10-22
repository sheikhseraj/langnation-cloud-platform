# ChatGPT Codex Agent — Review, Test and Fix Prompt

A first implementation of the LangNation **Lesen + Dictionary Integration** has already been completed by another coding agent.

You are the second-pass senior reviewer. Do not redesign the feature from scratch.

Read these specification files first:

- `00_README.md`
- `01_IMPLEMENTATION_SPEC.md`
- `02_DATA_MODEL_AND_API.md`
- `03_UI_UX_SPEC.md`
- `04_PILOT_DIE_FARBEN.json`
- `07_ACCEPTANCE_CHECKLIST.md`

Then inspect the complete diff and both applications:

1. `langnation.com` main website / Student Portal
2. `langnation.de` Dictionary

## Review objectives

Check whether the implementation:

- reuses existing auth and enrollment correctly;
- avoids a duplicate Dictionary dataset;
- uses real Dictionary search/business logic;
- keeps Dictionary outages isolated from lesson usability;
- uses a robust cross-domain/BFF integration;
- performs server-side authorization for lesson/progress/saved vocabulary routes;
- validates exercise answers safely;
- does not expose correct answers prematurely where avoidable;
- handles German Unicode and word normalization correctly;
- supports desktop selection and mobile interaction;
- follows the existing LangNation design without altering unrelated areas;
- provides loading/no-result/error states;
- persists progress correctly;
- avoids duplicate saved vocabulary;
- is accessible by keyboard and screen reader at a reasonable level;
- has no obvious XSS, CSRF, SQL injection, IDOR, CORS or secret-exposure issue;
- has appropriate request timeout, caching and rate-limit behavior;
- does not introduce unnecessary dependencies;
- includes meaningful automated tests.

## Required actions

1. Run formatting/lint/typecheck/test/build commands used by each repository.
2. Run or add tests for critical missing cases.
3. Fix clear defects directly.
4. Keep changes minimal and aligned with the existing architecture.
5. Do not invent a new auth system or rewrite unrelated code.
6. Do not replace real Dictionary integration with mocks.
7. Do not add a paid translation/AI provider without explicit approval.

## Manual acceptance walkthrough

Verify at least:

- unauthenticated access behavior;
- enrolled student opens `Die Farben`;
- non-entitled student is blocked according to existing portal rules;
- selecting/tapping `Regenbogen` or another word opens lookup;
- no-result and Dictionary-unavailable states behave correctly;
- audio is only shown/enabled when supported;
- all five pilot MCQs submit correctly;
- wrong answer → feedback → hint → retry works;
- progress survives page refresh and new session;
- completion is recorded once all required exercises are done;
- mobile viewport has usable selection and result bottom sheet;
- keyboard can use/close the popup;
- saved vocabulary belongs only to the current authenticated user.

## Final report

Return:

1. issues found, prioritized as Critical / High / Medium / Low;
2. exact fixes you made;
3. tests added/changed;
4. commands run and results;
5. remaining limitations or deferred improvements;
6. final verdict: ready for staging / not ready for staging.

Do not say "ready" while critical tests fail, security issues remain, or Dictionary integration is mocked.
