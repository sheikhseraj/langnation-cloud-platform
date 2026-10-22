# Homework implementation notes

Kapitel 09 now supplies configuration for the existing Homework system: 8 sections,
45 countable questions and all 10 requested question types. Solved examples do
not count. Speaking and Writing are excluded. Evaluation is deterministic and
server-side, with no model/API calls.

## Important files

| File | Change |
| --- | --- |
| `content/homework/intensive-a1-b1/09-negation.txt` | Full structured chapter: exact prompts, accepted variants, examples, hints, feedback, reading token groups, categories and adaptive scaffolds. |
| `tools/build-negation-content.js` | Reproducible transcription from the supplied Markdown specification. Runtime does not depend on the specification file. |
| `lib/exercise-format.js` | Validates `@learning` JSON through the same parser used by the library and admin source editor; retains legacy text parsing. |
| `lib/homework-engine.js` | Pure evaluator, normalization, configuration validation, gated reveal, status transitions, dynamic totals, resumable review and answer-key stripping. |
| `lib/homework-progress.js` | Transactional attempt creation and persistence, row locks, revision conflicts, preserved historical attempts and first-answer analytics for existing reports. |
| `lib/exercises.js` | Stores configuration, serves configured chapters, uses dynamic counts/current learning status and connects existing results to learning analytics. Historical question/answer rows remain intact. |
| `routes/student.js` | Connects the engine to the existing chapter and check routes; validates current chapter access and attempt ownership. |
| `routes/rootadmin.js` | Displays the configured question count when editing an upgraded chapter. |
| `views/pages/portal/exercise.ejs` | Selects the reusable learning worksheet inside the existing Homework page. Legacy chapters retain their renderer. |
| `views/partials/homework-learning.ejs` | Existing header and three-column shell, sanitized chapter bootstrap, course navigation and progress controls. |
| `public/js/homework-learning.js` | Reusable inputs, insertion slots, adaptive scaffolds, highlighting, categorization, feedback, retry, completion and review. Draft autosave preserves entered work. |
| `public/css/homework-learning.css` | Scoped brand-token styling, mobile navigation, visible status/focus indicators and unclipped sidebar labels. |
| `views/rootadmin/exercise.ejs` | Explains structured configuration editing in the existing source editor. |
| `MySQL/36_homework_learning.sql` | Adds nullable JSON columns `exercises.learning_config` and `exercise_attempts.learning_state`; no new tables or data deletion. |
| `server.js` | Probes the new columns through the existing migration-readiness mechanism. |
| `tools/upgrade-homework-learning.js` | Dry-run/apply command to update already-assigned Kapitel 09 content while preserving assignment IDs, enrollment/unlock rules and historical answers. |
| `tools/check-homework-learning.js` | 60 evaluator, state, persistence, migration and real HTTP-route tests with mocked database/auth providers. |
| `tools/check-views.js` | Tests the shipped chapter through its new renderer; keeps the legacy worksheet rendering cases. |
| `package.json` | Adds `check:homework` and includes the new tests in the existing `check` suite. |
| `content/homework/README.md` | Configuration format, deployment/upgrade instructions and guidance for adding another chapter. |

## Verification

- Existing `npm run check` suite passed, including 60 new tests and 269 rendered
  view cases. Existing environment warnings remain.
- JavaScript syntax checks and `git diff --check` passed.
- Desktop (1280px) and mobile (390px) browser checks verified the short navigation
  labels, no horizontal overflow, input/check/hint controls, insertion, reading
  fragment feedback, refresh persistence and review upgrading yellow to green.
- Browser testing used a localhost fixture with the real renderer/evaluator and
  in-memory persistence. Database query/transaction and route tests use mocks.
- `npm run lint`, `npm run typecheck` and `npm run build` were attempted: this
  JavaScript/EJS repository defines none of these scripts. Syntax and rendered-view
  checks are available, but are not a substitute claim for static type checking.
- No MySQL connection is configured locally. The migration, real database
  persistence across login and existing-assignment content upgrade could not be
  exercised against MySQL.

## Deployment and next chapters

Restart the application so its existing migration runner applies migration 36.
Then run `node tools/upgrade-homework-learning.js` to inspect matching assignments,
followed by `node tools/upgrade-homework-learning.js --apply` to upgrade them.
New assignments use the library configuration immediately. A student with legacy
answers gets a new learning attempt, so old scores and answers are not regraded.

For another chapter, add an `@learning` configuration in its workbook directory,
using stable question IDs and explicit accepted variants. Use the existing admin
editor and Give out homework flow. The README documents the format; no new routes
or chapter-specific UI are needed.
