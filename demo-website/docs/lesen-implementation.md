# Lesen implementation and release verification

## Status (5 October 2026)

The reusable module, pilot content, shared RootAdmin workflow, and Dictionary bridge are implemented. Local automated checks and browser fixture checks pass. **Production acceptance is pending a configured MySQL environment and a running Dictionary database.** The main checkout has no configured database; the Dictionary database connection refused connections. No production deployment or database migration was performed.

Final validation: main `npm run check` passed, including 30 Lesen/bridge tests; Dictionary `npm test` passed all 27 tests; desktop/tablet/mobile browser fixture acceptance passed; changed JavaScript syntax and `git diff --check` passed. Existing environment warnings (staging origin, incomplete imprint, SMTP and database configuration) remain. The QA fixture was stopped after verification.

## Architecture and reuse

The main site retains Express, EJS, mysql2, signed Student Portal cookies, RootAdmin authentication, and existing enrollment rules. Lesen extends the Homework `exercises`, `exercise_questions`, `exercise_attempts`, and `exercise_answers` model. Structured lessons and progress use the existing migration-36 `learning_config` and `learning_state` JSON. The shared Homework engine, progress service, revision checks, completion timestamps, assignment services, roster, and four RootAdmin templates are reused.

`routes/rootadmin.js` mounts the same administrator router at `/rootadmin/lesen`, scoped to reading records. Give Out, Take Back, Who Has What, batch filtering, multiple students, due dates, results and navigation follow Homework. Availability dates and required/optional assignment state are Lesen additions. Existing explicit-email assignments retain Homework's enrollment override; normal published lessons require active enrollment. Homework and Lesen are isolated by module, including title matching and leaderboard queries.

One renderer (`views/pages/portal/reading.ejs` and `public/js/reading.js`) handles A1–C2. `content/reading/a1-die-farben.json` supplies all pilot text, twenty options, five correct keys, hints, feedback and support anchors. `lib/reading-content.js` validates reusable JSON before saving. MCQ, multiple selection, true/false, fill-blank and short-answer types use deterministic server checks. Typed answers require explicit accepted variants; no semantic guessing occurs. Public lesson JSON excludes unearned keys and hints. Correct completion of required questions is necessary; a wrong attempt alone does not complete Lesen.

The Dictionary remains authoritative. `.com` makes server-to-server calls through `lib/dictionary-client.js`; the browser sees only the same-origin bridge. The `.de` endpoint reuses the same lookup handler as `/api/lookup`: memory cache, vocabulary, stored lookup results, then AI with existing background persistence. Lesen does not stop at spelling suggestions when an exact word is missing. No iframe, duplicate vocabulary dataset or separate AI pipeline is used. Saved words store a stable Dictionary key and a small per-student snapshot/context.

## Endpoints

| Route | Purpose |
| --- | --- |
| GET `/portal/lesen` | Entitled lessons and progress |
| GET `/portal/lesen/:id` | Reusable reader and persisted attempt |
| POST `/portal/lesen/:id/check` | Shared authoritative exercise actions |
| GET `/portal/dictionary/lookup?q=…&target=en` | Authenticated, cached and rate-limited bridge |
| GET/POST `/portal/vocabulary` | Own saved words / save verified entry |
| DELETE `/portal/vocabulary/:id` | Owner-scoped removal |
| `/rootadmin/lesen/exercises` | Existing scoped assignment list |
| `/rootadmin/lesen/give` | Existing Give Out / Take Back workflow |
| `/rootadmin/lesen/exercise/new` and `/exercise/:id` | Reused editor |
| `/rootadmin/lesen/exercise/:id/results` | Reused results with reading progress |
| GET `.de/api/v1/dictionary/lookup?q=…&target=en` | Versioned Dictionary API using the shared lookup pipeline |

State-changing Lesen requests require a double-submit CSRF token. Access is checked on every lesson/check/save request. Vocabulary reads/deletes bind the authenticated student. German selection is normalized without losing umlauts/ß; requests are capped at 250 characters, bounded by timeouts, cached and protected by per-student rate limits. The optional service key stays server-side.

## Content limitations and explicit deviations

- Listen uses German browser speech synthesis, as the existing Dictionary does. There are no recorded audio URLs. Consequently the original checklist's literal “real audio only” item is **not met**; the UI identifies synthesis in the Listen tooltip. Browser/OS voice availability needs device validation.
- Translation uses the existing Dictionary English lookup and AI fallback. AI results receive deterministic save keys before vocabulary IDs are assigned; later responses expose an alias for save verification. The existing Dictionary background jobs persist new words/results.
- The pilot's supplied wording is preserved, including its simplified color statements. Its optional cover image is empty; future lessons can reference a local `/img/` asset.
- New lessons belong in `content/reading/*.json` or the shared editor with an `@reading` source prefix. Use the same schema as the pilot, a unique stable lesson ID, and valid answer keys. Assigned content with existing attempts cannot be rewritten; publish a new lesson ID/version to preserve historical answers.
- Browser QA uses simulated persistence and Dictionary responses. It proves rendering and interaction, not live database persistence or real vocabulary coverage.

## Files

Main additions: `lib/reading-content.js`, `lib/reading-schema.js`, `lib/dictionary-client.js`, `lib/student-vocabulary.js`, `lib/csrf.js`, `routes/reading.js`, `content/reading/a1-die-farben.json`, `MySQL/37_reading_learning.sql`, three portal views (`lesen`, `reading`, `vocabulary`), `public/js/reading.js`, `public/css/reading.css`, and reading/Dictionary/browser check tools plus the local QA fixture.

Main extensions: `lib/exercise-format.js`, `lib/exercises.js`, `lib/homework-engine.js`, `lib/homework-progress.js`, `routes/rootadmin.js`, `routes/student.js`, `server.js`, portal/admin navigation partials, the four Homework administrator views, `.env.example`, and `package.json`.

Dictionary checkout changes: new `dictionary-api.js` and `tests/dictionary-api.test.cjs`; modifications to `vocabulary-lookup.js`, `server.js`, and `.env.example`. This checkout has no Git metadata; preserve these files in its deployment/version-control process.

## Deployment and rollback

1. Back up both databases and deploy to staging first. Run the Dictionary tests and deploy its API changes before the main-site bridge. Existing Dictionary lookup callers keep their prior behavior.
2. Set an identical strong `DICTIONARY_SERVICE_KEY` on both servers if protecting the API. Set `.com` `DICTIONARY_BASE_URL` to the Dictionary origin (default `https://langnation.de`), `DICTIONARY_TIMEOUT_MS` (default 60000; allowed 30000–90000), and `DICTIONARY_CACHE_SECONDS` (default 3600). Never place the key in browser configuration.
3. Apply prior migrations through 36, then additive `MySQL/37_reading_learning.sql` using the existing migration process. It adds the module/content key, availability and required state to exercises; last-opened time to attempts; and the owner-scoped `student_vocabulary` table. Existing exercises default to Homework. Restart so column probes refresh. Lesen returns 503 when required schema fields are absent.
4. Use RootAdmin → Lesen → Give Out to assign the pilot to a staging batch or selected students. No automatic mass assignment is performed. Availability values are UTC; due dates follow existing Homework conventions.
5. Perform all live acceptance checks below, then release. The apps are plain Node/Express applications with no separate frontend production build/typecheck command.

Rollback: disable/unassign Lesen first; keep the additive schema and stored progress. Do not drop the vocabulary table or columns to roll back application code. Prefer retaining the module-aware Homework filters even when hiding Lesen: old application versions would otherwise see reading records as Homework. Keep the Dictionary API until all main-site bridge traffic has stopped. Restore a database backup only through the normal deliberate recovery process.

## Verification against `Lesen/07_ACCEPTANCE_CHECKLIST.md`

| Checklist group | Local evidence | Remaining live acceptance |
| --- | --- | --- |
| A Architecture | Shared auth/enrollment/services inspected; module query tests; no iframe/dataset copy | Verify actual staging entitlements and RootAdmin access |
| B Reading | Five-question pilot renders in desktop/tablet/mobile browser fixture; outage leaves reader usable | Assign pilot through real database |
| C Selection/Dictionary | Unicode, punctuation, empty selection, limits, cache/error tests; selection, no-result and outage browser checks | Real API against vocabulary, inflections, articles and phrases; physical-device tap/long press |
| D Dictionary UI | Compact panel, mobile sheet, responsive overflow checks; conditional fields | Real long compounds and device voice behavior; recorded-audio item remains a documented deviation |
| E Exercises | All twenty options, correct/wrong checks, hints/retry/reveal, variants and invalid publication tests | Persist attempts/hints against MySQL |
| F Progress | Engine/service reuse, refresh/completion verified in fixture | Real refresh, logout/login, completion timestamp, last-opened timestamp and administrator result persistence |
| G Vocabulary | Verified entry save, duplicate handling, owner-bound SQL; browser save/remove | Two real student accounts, full Dictionary reopening, database uniqueness |
| H Security | CSRF, lesson/attempt ownership HTTP tests, escaped content, parameterized queries, service key separation | End-to-end enrollment/availability boundaries and other-student ID tampering on staging |
| I Accessibility | Labels, live feedback, keyboard Alt+D, Escape/focus and modal behavior | Screen reader and touch-device review |
| J Delivery | Main full check, Dictionary suite, fixture browser checks, environment/migration/rollback documentation | Live database migration and full release smoke test |
| Reusable answer rules | Shared renderer; all MCQ options; exact multi-selection; approved typed variants; rejected invalid keys; data-driven hints | Author and assign another CEFR lesson in staging |

Run `npm run check` in the main repository and `npm test` in the Dictionary checkout. For isolated UI checks, start `node tools/preview-reading.js`, then run `node tools/check-reading-browser.cjs` with `PLAYWRIGHT_MODULE` pointing to an installed Playwright module if not locally resolvable. The fixture binds only to `127.0.0.1:3047`; do not deploy it as the application. `READING_SCREENSHOTS` controls optional screenshot output. Stop the fixture after review.

## Compact Dictionary follow-up

The popup is now 390px maximum width on desktop, with a navy/gold header, collapsed examples and additional matches, and Copy after Save. Mobile retains a bounded bottom sheet. Missing words use the existing Dictionary AI flow; empty results are not cached by the bridge or browser. Set `DICTIONARY_TIMEOUT_MS=60000` on the main server and deploy both applications (Dictionary first). Existing AI provider credentials remain on the Dictionary server. No new SQL migration is needed. These follow-up changes were tested locally with simulated services; live AI/provider persistence still needs a server smoke test.

## Reading navigation follow-up

Lesen keeps the existing Student Portal shell and now uses a cream/navy reading card and a compact, nonmodal desktop Dictionary card anchored near the selection; mobile uses the bottom sheet. Exercises render one question at a time, with previous/next controls and a question counter. Moving between questions persists drafts and the question position through the existing locked/revision-checked learning-state service. Navigation does not mark unanswered questions complete. Restart resets the position to the first question. A filtered card library, breadcrumbs and entitled previous/next lesson links support multiple assigned readings without combining their texts or questions on one page. No database migration is needed for the added JSON state field.

Validation: full main-site check passed (32 Lesen/bridge tests), including bounds validation for question position. Browser checks passed draft preservation across navigation/reload, all five questions one at a time, hints/retries, Copy/save, contextual popup bounds, desktop/tablet/mobile layouts and administrator forms.

## Approved Lesen UX refactor

The existing portal header, profile, sidebar, authentication and Homework assignment system are preserved. Added content-area learning links and A1–C2 navigation; level-scoped lesson navigation respects the authorized list. Moved progress and save status into the comprehension card. The large lookup button is removed: selection/tap opens the toolbar, Alt+D opens Meaning, and Alt+W focuses the toolbar (arrow/Home/End navigation supported). Tap creates a gold-highlighted word selection. Mobile Dictionary cards retain margins.

The shared `views/partials/reading-lesson.ejs` powers both students and RootAdmin preview. `public/js/reading-popover.js` owns selection, caching, cancellation, translation, ranking and vocabulary actions; `reading.js` owns exercise navigation and rendering. The CSS was consolidated into readable scoped rules. Meaning shows a best-match entry and one collapsed Other meanings group. Translate shows German/English instead of vocabulary cards. Save in the toolbar immediately saves the best match; saved state is also loaded on refresh. Vocabulary displays existing lesson/CEFR/date/context through its existing lesson reference, with article-bearing headwords; no new table or migration.

RootAdmin's saved lesson editor has a preview link. GET/POST `/rootadmin/lesen/exercise/:id/preview` use RootAdmin auth/CSRF and the same parser/answer engine. Preview answers are held in browser state only; student attempts and vocabulary are never written. Dictionary/save actions are disabled in preview, explicitly labelled. Existing draft/publication and explicit assignment rules are unchanged. Save an edited lesson before previewing it.

Validation: full main checks passed; 34 Lesen/bridge tests passed including real preview HTTP routes with all DB writes forbidden; browser fixture covered all five pilot questions, draft/position refresh, direct toolbar Save, duplicate saved display, Copy, separate translation, collapsed alternatives, viewport bounds and administrator forms. Dictionary tests cover shared cache/DB/AI behavior, ranking, translation and error propagation. Browser fixtures remain local test tools, not production data. No independent lint/typecheck/frontend-build scripts exist; the repository's check suite and JavaScript syntax checks are used. Live provider/DB persistence and production RootAdmin assignment still require a server smoke test.

Deploy the Dictionary API update first, then the main-site reader/assets. No new environment variables or SQL are required; retain matching service keys and the existing 60000ms timeout setting. No push or deployment is performed as part of this local refactor.

## Dedicated reader workspace

The Lesen library remains in the original profile/sidebar portal layout. Clicking Starten/Weiterlernen opens `/portal/lesen/:id` as a focused learning workspace, following Homework's library-to-lesson architecture. The reader opts into a scoped header navigation (Learn, Practice, Reading, Vocabulary, Progress), a compact level sidebar, real account/profile controls, breadcrumb/title and bounded reading/question cards. It retains the same reading partial, endpoints, data, saved vocabulary and progress engine. Other portal pages and RootAdmin are unaffected. Desktop shows a wide workspace; tablet wraps the learning header; mobile replaces the sidebar with compact level navigation. No database or Dictionary changes are required for this layout update.

Verification: full repository check passed (34 Lesen/bridge tests), with browser assertions that the library retains the profile sidebar and its lesson button opens the dedicated workspace. Existing question/draft/completion, Dictionary, saved vocabulary and responsive checks passed. This workspace change is local and has not been pushed/deployed.

## Workspace dark mode

Lesen colors now resolve through theme-aware reading tokens backed by the existing portal theme variables. Removed the forced light color scheme. Workspace/header/sidebar, reading/exercise cards, popup/toolbar, selected answers, text selections, progress, hints, controls and footer adapt to both the stored theme toggle and system dark preference. Light-mode cream/gold values remain unchanged. Browser verification covered dark-mode persistence after reload, system-preference fallback, switching back to light, desktop/mobile popovers and minimum 4.5:1 text contrast for the reading card and Dictionary panel. Screenshots were visually inspected. No settings, schema or dependencies were added.

## Compact reader refinement
The existing reader is constrained to 1120px with 800px text measure, 18px desktop reading text, a 320px anchored Dictionary (420px maximum desktop height), a compact contextual toolbar, and two-column desktop answers. Dark mode uses the same geometry. Selection changes dismiss old results; scrolling updates the selection anchor. No database, API, authentication or portal shell changes.

Validation: full npm check and browser checks covering 1920x1080, 1366x768, tablet/mobile, dark mode, exercise persistence and vocabulary actions. Browser previews use the local QA fixture; live Dictionary/database services were not retested. Changes are not pushed.

## Anchored Dictionary callout refinement
The reader now uses a centered 960px container. The selection toolbar stays visible above the selected word while the nonmodal Dictionary opens beside it with a directional pointer. Placement tries right, left, then a viewport-clamped vertical fallback. Mobile retains a rounded floating card without an overlay. An inner scroll container keeps expanded content bounded without clipping the pointer. Opening uses a 160ms animation and respects reduced motion. Existing services and grading remain unchanged; no DB or environment changes. Full project checks and local fixture browser checks passed; production services were not retested. Not pushed.
