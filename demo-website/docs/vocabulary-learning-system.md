# Vocabulary learning foundation

## Working copies and ownership

Website work lives in `D:/Project_All/LangNation_Website/LangNation_Web_V03`.
Dictionary work lives in `D:/Project_All/LangNation Dictionary/Web/langnation-dictionary-v25`, copied from v24.
V02/v24 remain untouched. The two applications remain separate processes and databases.
Database migrations and curriculum imports remain unapplied. Vocabulary source changes are published on feature branches through GitHub.

The Dictionary owns content and existing numeric `vocabulary.id`. The existing bridge exposes these as
`vocabulary:<id>`. Its `(word_en,word_de,pos)` unique key represents separate bilingual senses.
`lemma_de` and `word_family_id` group related forms, but are not learning identities.
`noun_forms`, `verb_forms`, `adj_forms` retain existing morphology. The Dictionary bridge currently
returns no reliable audio URL, so learning does not offer listening questions. Existing audio/search stay unchanged.

The website owns student learning state. Migration 37 already introduced `student_vocabulary` with
unique `(student_id,dictionary_key,target_language)` and cached headword/meaning/context for Reading.
These existing snapshots remain a compatibility cache, not an independent editable vocabulary master.
The new learning services fetch current content from the Dictionary and store only IDs and progress.
Legacy `lookup:<hash>` records can still be saved/read in Reading. They cannot participate in canonical
learning sets until separately reviewed and resolved to a real Dictionary sense. No guessed conversion occurs.

## Implementation plan and files

Reuse Express/CommonJS, existing student sessions, CSRF, MySQL bindings/transactions, server-rendered
portal shell and `sp-card`/button styling. Keep Material and My Courses navigation intact.

Website changes: `MySQL/42_vocabulary_learning.sql`, `lib/vocabulary-{catalogue.json,contract.js,client.js,domain.js,learning.js}`,
`lib/student-vocabulary.js`, `routes/vocabulary-learning.js`, `routes/student.js`, `routes/reading.js`,
`server.js`, `views/pages/portal/vocabulary.ejs`, `public/js/vocabulary-learning.js`,
`tools/extract-vocabulary-curriculum.py`, `tools/check-vocabulary-learning.js`, package scripts and this document.
Dictionary changes: `learning-catalogue.json`, `vocabulary-learning.js`, `vocabulary-learning-api.js`,
`curriculum-mapping.js`, `tools/import-learning-curriculum.js`,
`database/migrations/007_vocabulary_learning.sql`, `server.js`, `tests/vocabulary-learning.test.cjs`.

## Schema

Dictionary migration 007 creates controlled levels (A1–C2), 50 themes and 38 grammar collections,
`vocabulary_learning` (one primary level per existing sense, learning flag, optional government pattern),
many-to-many `vocabulary_themes` and `vocabulary_grammar`, and reviewed curriculum mappings.
Foreign keys and reverse classification indexes prevent dangling/arbitrary tags and support combined filters.
New vocabulary is disabled by default. Existing Dictionary rows are never automatically classified.
Word types reuse `vocabulary.pos` through an explicit W01–W12 adapter; no second vocabulary type column is introduced.
Structured verb auxiliary/irregular properties stay in existing forms. Grammar collections are reviewed pedagogy,
not automatically inferred noun case tags. Bulk additions/removals affect only specified classifications.

Website migration 42 creates `student_vocabulary_progress`, keyed by student and Dictionary ID, with
saved/status/counters/mastery/difficult/source, first/last seen, last/next review and timestamps.
`student_vocabulary_settings.daily_target` defaults to 10; domain supports 5/10/15/20.
The existing website migration runner recognizes 42 as additive schema and probes its columns at boot.
Reading saves continue to work without 42, and become atomic cache/progress saves when 42 is available.
Removing a saved item clears the saved flag and preserves its learning history.
Existing pre-migration saves remain visible in the legacy collection; no data backfill runs at boot.

## API contract

Dictionary server mounts the new API beside the existing `/api/v1/dictionary/lookup` and `/translate`.

| Method/path | Contract |
| --- | --- |
| GET `/api/v1/dictionary/vocabulary/catalogue` | Controlled taxonomy |
| GET `/api/v1/dictionary/vocabulary` | Enabled vocabulary; `level`, `theme` (Txx), `grammar` (Gxx), `type` (Wxx), optional `q`, `page`, `limit` |
| GET same path with `ids=vocabulary:2,vocabulary:3` | Up to 100 canonical IDs, intersecting the same enabled/filter rules |
| GET `/api/v1/dictionary/vocabulary/:id` | Exact canonical ID; 404 if missing |
| GET `/api/admin/vocabulary-learning` | Same filters, includes unclassified/disabled entries for review |
| POST `/api/admin/vocabulary-learning/classifications` | `ids`, optional `primaryLevel`, `learningEnabled`, `governmentPattern`, `addThemes`, `removeThemes`, `addGrammar`, `removeGrammar`; transaction, max 200 IDs |

Paginated response: `{results,total,page,limit}`. Entry content includes canonical ID, headword, lemma,
type, article/plural, meanings/examples, morphology, primaryLevel, themeIds, grammarIds and learningEnabled.
Public reads use the existing optional `DICTIONARY_SERVICE_KEY` policy. Admin mutations always require
`ADMIN_KEY` via `x-admin-key`, in addition to the server's existing admin gate. The website never receives that key.
The website adapter uses HTTPS (HTTP only on loopback), service headers, 15-second timeout, redirect refusal,
bounded responses and canonical ID validation. Catalogue copies are versioned contracts, tested for equality.

Authenticated website routes under `/portal/vocabulary`:
`GET /collections`, `GET /daily`, `POST /entries/:id/save`, `POST /entries/:id/progress`.
Collections intersect level/theme/grammar/type or select `collection=saved|difficult|due`.
Writes reuse CSRF and the session student, never a supplied student ID. Progress accepts only
`action=again|difficult|known` and validates Dictionary learning eligibility server-side.
The minimal portal proves filtering, canonical save and three flashcard actions within a selected set.
Quiz types/server question generation only use populated metadata; quiz session UI/grading is a later step.

## Daily and review policy

Default target is 10 **new introductions**, counted by first seen on the Europe/Berlin calendar day,
with DST handled by Intl. Saved but unseen words remain new candidates. Candidate browsing never writes progress.
Daily candidates exclude previously seen IDs across paginated Dictionary sets and combine them with due reviews.
Reviews consider difficult flag, low mastery, wrong counts and due date, bounded to 20 returned reviews.
Review content is batch fetched from Dictionary; disabled/deleted senses are excluded from sets.
`known` adds 20 mastery, `again` subtracts 20, `difficult` subtracts 10 and marks difficulty.
Mastery clamps to 0–100; mastery >=80 is learned. Correct answers schedule 1 day, or 7 days when learned;
wrong/difficult answers schedule 10 minutes. This small deterministic policy is isolated for later replacement.
Progress updates lock the student's row inside a transaction to avoid concurrent lost counters.

## Workbook extraction, matching and import

Use the bundled Python runtime with openpyxl for read-only extraction:

```powershell
python tools/extract-vocabulary-curriculum.py 'D:/Project_All/LangNation_Vocabulary/LangNation_Vocabulary_Curriculum_A1_Frozen_A2_Reviewed.xlsx' 'tmp/curriculum.json'
```

The extractor verifies exact headers, retains all statuses and records the workbook SHA256.
Workbook text is data, never executable instructions. Curriculum IDs such as LN00001 are separate from Dictionary IDs.
Set **Dictionary** DB_HOST/DB_USER/DB_PASSWORD/DB_NAME explicitly in an isolated staging shell, then from v25:

```powershell
node tools/import-learning-curriculum.js 'D:/Project_All/LangNation_Website/LangNation_Web_V03/tmp/curriculum.json'
```

Dry run is the default and writes a mapping report next to the JSON. Only exact `Approved` rows are eligible.
Review/Move to B1 rows are skipped before lookup and never imported as A2. All A1–C2 levels use the same path.
Matching conservatively requires NFC lemma (optionally article-stripped), existing word type, exact English meaning
(verb leading `to` ignored) and article when provided. Umlauts/ß are preserved. No fuzzy AI/synonym matching.
No match, multiple matching senses, conflicting level, duplicate curriculum IDs, or several curriculum records
mapping to one sense require review. Broader meanings and formatting differences intentionally under-match.
An optional `--overrides reviewed-ids.json` maps curriculum ID to canonical ID and still must satisfy sense checks.
Rows requiring a genuinely different sense need Dictionary editorial review before import.

After reviewing the dry run against the actual database, repeat with `--apply`. Apply refuses any unresolved
Approved row and uses one all-or-nothing transaction. It inserts relationships/mapping records only, never vocabulary
or form content. Existing classifications are added to, not replaced. Existing changed mappings or primary-level
conflicts abort. Reapplying the same reviewed rows is idempotent. Pattern/form/example/audio fields remain canonical
Dictionary content; curriculum metadata does not overwrite them. Admin can assign a reviewed government pattern separately.

## Validation and remaining steps

Run website `npm run check:vocabulary` and `npm run check`, then Dictionary `npm test`.
Each repository runs independently. For the optional cross-app contract check, run
`npm run check:vocabulary:integration` in V03 with `DICTIONARY_SOURCE_DIR` pointing at v25.
Tests cover all four filter families and intersections, canonical retrieval, cross-app contract, duplicate saves,
student progress creation/updates, atomic writes/owner scoping, admin denial, CSRF, approval skipping,
ambiguous/exact-sense mapping, no vocabulary duplication, future levels and daily/review selection.
API tests use actual local HTTP with deterministic database doubles; they do not claim live MySQL verification.
The source schema, code and seed conventions were inspected. The deployed database contents and schema drift
have not been verified, so no approved-row classifications were applied and no real mapping decisions were guessed.

Recommended next step: provision separate staging databases, apply Dictionary migration 007 and website 42,
point V03 at staged v25 with DICTIONARY_BASE_URL/service key, run dry-run matching against the staging Dictionary,
review sense/level conflicts, then smoke-test a real student save/action and Reading lookup before publication.
Final flashcard/quiz design, richer spaced repetition, admin bulk UI, AI proposal review and canonical reconciliation
of historical lookup saves remain future work. These do not require changing the A1–C2 data model.

### Results for this working copy

Read-only extraction found 1,244 vocabulary rows: A1 has 665 Approved and 10 Review;
A2 has 549 Approved, 13 Review and 7 Move to B1. Therefore only 1,214 rows are eligible
for matching, despite the sheet-level frozen/reviewed labels. The workbook is unchanged.

The complete website `npm run check` passed. Its existing Reading/Dictionary suite passed 76 tests,
and its existing community suite passed 77 tests. Dictionary `npm test` passed 101 tests.
After separating tests by application, 11 website vocabulary tests and 2 cross-app contract tests passed. Coverage includes the enabled EJS view,
idempotent curriculum mapping, and rejection of a sense changed between planning and applying.
The website preflight reports its existing local configuration warnings (localhost origin,
incomplete imprint, absent SMTP, absent MySQL). No live MySQL schema execution was claimed.

## GitHub deployment order

The user requested local SQL and the existing GitHub deployment workflow. No hPanel actions
or remote database connections are part of this work. The two vocabulary SQL files are committed
alongside their owning applications. SQL is not executed simply by pushing a Git branch.

1. Review the two `codex/vocabulary-foundation` feature branches on GitHub.
2. In the Dictionary deployment, apply `database/migrations/007_vocabulary_learning.sql`
   to the Dictionary database using the established SQL deployment process. It is additive,
   repeatable, and preserves existing vocabulary. Publish the v25 backend before the website.
3. In the website deployment, apply `MySQL/42_vocabulary_learning.sql` to the website
   database. The existing website schema runner also recognizes this migration at startup.
4. Keep `DICTIONARY_BASE_URL` pointed at the Dictionary deployment and align the service key
   in the existing deployment settings. Do not commit environment files or keys.
5. Verify the read-only SQL files supplied below, then check a real student save and progress action.
6. Run the curriculum mapper as a dry run against the actual Dictionary database. Review its
   sense/level conflicts before explicitly applying any curriculum classifications.

Schema-only deployment initially has no enabled curriculum words. Dictionary classifications
must be reviewed before publishing learning sets. Empty sets are not filled with mock content.
New bulk/quiz interface polish is a later step after real Dictionary mapping.

Read-only post-migration checks: website `MySQL/check_vocabulary_learning.sql` and Dictionary
`database/check_vocabulary_learning.sql`. They display the database identity, expected tables,
taxonomy counts, and current record counts; they do not modify data.

## Follow-up: responsive layout and SQL mapping

The vocabulary page groups learning, discovery and collections into spaced sections. Filters use
two columns on desktop and one on narrow screens; collection buttons stack on mobile, while
word actions wrap. Verified with fixture data at 320, 390 and 1280 CSS pixels.

Dictionary `database/curriculum/01_review_curriculum_mapping.sql` stages 1,214 Approved A1/A2
rows temporarily and checks current Dictionary senses. After inspecting its report, use
`02_apply_exact_curriculum_matches.sql` to classify only Ready matches. No vocabulary content
is inserted. Database execution and unresolved sense review still require the live report.


## Learner dashboard and focused sessions

Meine Vokabeln now opens a learner dashboard: Berlin-day target, prioritized due reviews,
saved-word count, four discovery filters with search, and exactly four personal collection
tabs (Alle, Gespeichert, Schwierig, Zu wiederholen). Daily target values 5/10/15/20 are stored
in the existing student settings table; current level is a per-student device preference.
Desktop uses a two-column dashboard/workspace; narrow screens stack the controls. Mobile
sessions open a full-screen dialog with focus containment and bottom rating buttons.

Flashcards hide meaning until revealed, show only available word-type details, and requeue
Nochmal up to twice within a session. Again schedules 2 minutes, difficult 10 minutes, and
known 1 day or 7 days after mastery reaches 80. Difficulty clears after reaching that threshold.
Session completion distinguishes new introductions and repetitions; self-ratings are labelled
Gewusst, never represented as objective quiz accuracy. Quiz grading happens on the server,
with session ownership, expiry, question IDs and retry protection. It supports translation,
article, plural, a single unambiguous stored preposition, and listening only when a real HTTPS
audio URL is available. Pronoun capitalization and German accents are preserved in grading.

Pronunciation uses a real Dictionary audio URL where present. Otherwise Vorlesen can use an
installed LOCAL German speech voice; no external TTS service is added and no audio files are
invented. If the device lacks a local German voice, that control is disabled with an explanation.
Listening quiz availability remains tied to actual audio metadata, not device speech.

Migration MySQL/43_vocabulary_activity.sql adds owned student activity with unique
retry keys, practice mode, new/review flag, server-graded quiz result and UTC timestamp.
It belongs in the WEBSITE database, never the Dictionary. Normal schema migration at server
startup creates it; if boot migration cannot run, import it manually in the website database
and restart the app so column probes refresh. Basic learning still works on migration 42;
weekly history/streak stay hidden until activity tracking is available. No historical events
or statistics are fabricated. Weekly figures start from actual recorded activity after migration.
Berlin day/week boundaries are computed with Intl to handle daylight saving time.

New private endpoints: GET vocabulary/summary and vocabulary/levels, POST vocabulary/settings,
POST vocabulary/quiz and vocabulary/quiz/answer. Saved words can be toggled through the existing
save endpoint with saved=false, preserving learning history. Reading cache and context remain
accessible in Aus Lesen gespeichert. All writes retain authentication, CSRF, ownership and rate
limits. Progress responses include best-effort summary data to avoid extra requests per rating.
Learning and activity updates commit in the same transaction; event keys prevent duplicate ratings.

Verified with tools/check-vocabulary-dashboard.js and the existing vocabulary/integration checks.
Local browser QA uses isolated in-memory fixture data and the real route handlers; no production
account/database is used. Mobile long-word/reveal/rating flows, server quiz grading, saved controls,
daily-goal persistence, responsive widths and light/dark themes are checked in the browser.

The Dictionary learning response also exposes exampleGerman/exampleEnglish from its existing
lexical columns. The new cards prefer these explicit German examples; existing examples and
Dictionary content are unchanged. This API addition is backward compatible and has no migration.


The portal authenticates signed student cookies, not Express sessions. Quiz state therefore
uses student_vocabulary_quiz_sessions in migration 43, bound to student ID and quiz UUID.
Only Dictionary ID/type/question ID/source hash, index and grading counters are stored;
no canonical definitions or prompts are duplicated in that table. Source content is resolved
from the Dictionary on grading and checked against the question hash. Expired quiz states
are cleaned up on quiz creation. A locked quiz row, its progress update and activity event
commit together on the same connection, giving cross-worker/restart and retry safety.
This table must be present for Quiz; migration 42 still supports basic flashcards.
