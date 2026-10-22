# Claude Code — Main Implementation Prompt

You are implementing a production feature in my existing LangNation systems.

I have two applications/repositories:

1. Main website + Student Portal: `https://www.langnation.com/`
2. LangNation Dictionary: `https://langnation.de/`

Read these files completely before changing code:

- `00_README.md`
- `01_IMPLEMENTATION_SPEC.md`
- `02_DATA_MODEL_AND_API.md`
- `03_UI_UX_SPEC.md`
- `04_REUSABLE_READING_TEMPLATE.json`
- `04A_EXERCISE_ANSWER_RULES.md`
- `04_PILOT_DIE_FARBEN.json`
- `07_ACCEPTANCE_CHECKLIST.md`

## First step — inspect, do not code yet

Inspect both existing repositories and tell me:

1. frontend framework and version for each app;
2. backend framework/runtime for each app;
3. database/ORM used in each app;
4. current authentication/session strategy on `langnation.com`;
5. current course/enrollment model and where student entitlement is checked;
6. current Student Portal route/component structure;
7. whether there is an existing Homework/quiz/exercise engine that can be reused;
8. existing Dictionary search route/service used by `langnation.de` itself;
9. existing Dictionary entry identifiers and result shape;
10. existing design tokens/components that match the Dictionary screenshot/style;
11. test framework and current CI commands;
12. which files, DB tables/migrations and routes you expect to modify.

Then give me a concise implementation plan in phases.

Do not start coding until you have completed that inspection and plan.


## Reusable-template requirement — mandatory

Build **one data-driven Lesen lesson renderer/template** that can be reused for future A1, A2, B1, B2, C1 and C2 lessons. Do not create a custom React/page implementation for each lesson and do not create a special one-off `Die Farben` page.

Use `04_REUSABLE_READING_TEMPLATE.json` as the target content structure, adapting field names only when the existing LangNation architecture has an established equivalent. `04_PILOT_DIE_FARBEN.json` must be stored/loaded through the same reusable data model and renderer.

Every exercise must have a complete deterministic answer definition as specified in `04A_EXERCISE_ANSWER_RULES.md`:
- MCQ: send/show all student-selectable options, store all correct option IDs server-side;
- true/false: exact Boolean key;
- fill blank: complete author-approved `acceptedAnswers[]` plus normalization rules;
- short answer: author-approved accepted variants/model answer;
- future multi-select/matching/ordering: complete deterministic key/mapping/sequence.

Do not use AI at runtime to guess whether an answer is correct. Add publish/schema validation so incomplete answer keys cannot silently go live.

## Implementation rules

- Extend the existing systems; do not create a second portal, second auth system, second enrollment system or second Dictionary database.
- `langnation.de` remains the source of truth for Dictionary data.
- Prefer a same-origin Dictionary bridge/BFF endpoint on `langnation.com` that calls the Dictionary server-to-server, unless the existing architecture clearly makes a direct CORS API cleaner.
- Do not iframe the Dictionary website.
- Reuse the existing Dictionary search/business logic rather than implementing a second search algorithm.
- Reuse the existing Homework/exercise/progress infrastructure if it is suitable; extend it instead of duplicating it.
- Do not redesign unrelated LangNation pages.
- Do not silently change existing authentication, enrollment, payment or course behavior.
- Never hardcode secrets.
- Keep production and development origins/config in environment/config files using existing project conventions.
- Preserve German characters correctly.
- Do not add a new paid AI/translation service without my approval.
- If phrase translation is not supported by the existing Dictionary, implement a graceful unavailable state while keeping word lookup fully functional.
- Keep the implementation responsive and accessible.

## UX requirements

Inside a Lesen lesson, a student can select/tap German text and access:

- Meaning
- Translate
- Listen
- Save

For a word lookup, show a compact popup/card visually inspired by the existing LangNation Dictionary: cream background, navy outline/type, restrained gold accents, serif headword style where compatible, and sections such as Meaning / Word Family / Examples only when real data exists.

On mobile, use a bottom sheet/drawer for the full result.

The Dictionary popup must never prevent the student from continuing the reading lesson if the Dictionary API is unavailable.

## Pilot

Use `04_PILOT_DIE_FARBEN.json` as the first A1 lesson fixture/content.

The pilot must prove:

1. enrolled student access;
2. lesson rendering;
3. contextual word selection/tap;
4. real Dictionary lookup;
5. real Dictionary result rendering;
6. pronunciation when real audio exists;
7. MCQ submission and server-validated answer;
8. hint and retry;
9. progress persistence;
10. lesson completion;
11. mobile usability.

## Testing

Add/extend tests for:

- auth/entitlement;
- lesson retrieval;
- exercise submission;
- correct/incorrect attempt persistence;
- Dictionary bridge success/no-result/error/timeout;
- selection normalization;
- saved vocabulary authorization and deduplication if implemented;
- responsive critical UI where the current test stack supports it.

Run the repository's formatting, lint, typecheck, unit/integration tests and relevant build command.

## Before finalizing

Show me:

- exact files changed;
- migrations added;
- routes/endpoints added;
- environment/config variables added;
- tests added and their results;
- any remaining risks or items intentionally deferred;
- manual steps required for deployment.

Do not claim completion if tests are failing or if the real Dictionary integration is still mocked.
