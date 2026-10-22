# Website-owned vocabulary catalogue

Implemented 2026-10-10. Learning lists, counts, filters, daily goals, blocks, personal collections, flashcards, quiz and writing read Website-owned data through lib/vocabulary-client.js. None of these reads calls the Dictionary API. The Dictionary remains the lexical source for explicit updates; lookup popovers and text translation are separate features and may still use its API.

## Initial release and identity

The supplied complete lexical export was validated: **12,252 existing IDs**, 3,928 noun-form rows, 1,878 verb-form rows and 1,109 adjective-form rows. The committed seed contains derived public lexical payloads, not the raw CSV or student/account data. A guarded overlay applies **113 reviewed existing-ID classification/form repairs**, giving **2,612 enabled learning entries**. Existing classified CEFR levels are retained. All canonical IDs remain vocabulary:<original Dictionary number>; progress references require no migration.

Initial catalogue revision: `cadb304922fc53af7ecb8969d8bb9d240ea423dad3335a1d7b42b0112f73cae5`. Regenerating from the supplied CSV produces exactly this revision. The review manifest and source hash are recorded in the bundle and each database revision. This implementation neither creates Dictionary entries nor changes its lexical tables.

| Required set | Enabled local entries |
| --- | ---: |
| Modalverben | 7 |
| Akkusativ-Präpositionen | 7 |
| Dativ-Präpositionen including ab, außer, gegenüber | 10 |
| Wechselpräpositionen | 9 |
| Articles | 6 |
| Pronouns | 12 |

The seven modals are dürfen, können, mögen, möchten, müssen, sollen and wollen. Formal **Sie is pending**: the supplied snapshot does not contain an assigned Dictionary ID for this reviewed sense. No ID is invented. The separate approved Dictionary repair can create it; a subsequent complete export includes it and clears the pending flag. Lowercase sie keeps both she/they meanings. G24, W10 and W11 remain honestly empty. The 23 unsupported legacy POS rows stay disabled and unchanged. Distinct bilingual senses and same-lemma IDs remain separate.

## Activate the database copy

After deploying Website code, learning works immediately from the committed local seed while the catalogue schema is absent or has no published revision. The seed stays on the server; browsers receive only paginated Website APIs.

1. Sign in to the existing **Root admin** content editor.
2. Open **Teaching → Wortschatz-Katalog**, at `/rootadmin/vocabulary-catalogue`.
3. Click **In Website-Datenbank importieren** once. This explicit authenticated, CSRF-protected action checks that the configured database contains Website student/progress tables, creates six additive catalogue tables, and publishes the validated seed. Existing progress and student tables are untouched. Repeating initial import never overwrites an already published version.

No automatic startup migration or data import was added. The schema is deliberately unnumbered: MySQL/local_vocabulary_catalogue.sql. Automatic approval review rejected startup activation because deployment would otherwise create and populate persistent database tables as a side effect. Database activation was therefore made an explicit operator action.

Equivalent operator CLI, using the Website's existing DB_* configuration:

```powershell
npm run vocabulary:sync -- --bundle data/vocabulary-catalogue/seed.json --apply --create-schema
```

## Explicit synchronization

Deploy the Dictionary's authenticated read-only `GET /api/v1/dictionary/vocabulary/export` endpoint. Configure matching **DICTIONARY_SERVICE_KEY** in both applications and set Website **DICTIONARY_BASE_URL** to the Dictionary origin. Keep these secrets in deployment environment variables, never in source files. Ordinary public read access does not authorize a full export; the service key is mandatory. Export uses a consistent read-only transaction and includes the complete lexical/forms/taxonomy snapshot, with no student/account data.

Use **Dictionary synchronisieren** on the same admin page after initial import. Alternatively prepare and inspect before explicitly applying:

```powershell
npm run vocabulary:sync -- --sync --out prepared-vocabulary.json
npm run vocabulary:sync -- --bundle prepared-vocabulary.json --apply
# Read-only offline preparation from a complete export:
npm run vocabulary:sync -- --snapshot 'C:/path/complete-export.csv' --out prepared-vocabulary.json
```

Sync is manual, not scheduled. Source requests require HTTPS (localhost permitted for tests), reject redirects, have a 60-second timeout and a 32 MiB bound. Missing keys, unavailable sources, malformed/truncated exports, duplicate IDs, changed reviewed senses, deliberately disabled reviewed entries, unknown tags or invalid checksums reject publication. Removed existing IDs require review rather than silently deleting progress references.

Imports validate before data writes, lock the singleton version pointer, reject stale concurrent publication, insert new version rows and switch the active pointer only when the transaction completes. Failed import rolls back, leaving the previous copy active. Repeat imports of the same checksum are idempotent. All prior versions are retained; no automatic cleanup is installed. Old versions consume storage and can be used for a reviewed recovery. Genuine Website DB transport/permission errors remain visible; the bundle fallback is only for unconfigured/absent/unpublished catalogues.

## Verification and limits

- Website full npm run check: passed; final vocabulary suite **88 tests** (including **25 local catalogue/admin tests**), and cross-application contract integration **2 tests** passed.
- Dictionary full npm test: **226 tests** passed in the shared working tree; **3 export tests** are introduced by this implementation. Concurrent unrelated Dictionary changes are excluded from this task's commits.
- Actual Website SQL filters were exercised via the Node 24 SQLite adapter for all **50 theme, 38 grammar and 12 type** filters; file and database results agree. Closed sets, article/pronoun senses, AND filters, pagination, wildcard escaping and NFC/umlaut search pass.
- Checksum rejection, source-failure retention, rollback, stale-version/deletion guards, repeat import, successful version replacement and preserved student progress pass. Real local vocabulary supports progress, quiz and writing with global Dictionary networking disabled; student writes in that integration test use an isolated fixture.
- Browser QA uses the actual committed file provider with Dictionary networking disabled and isolated student-progress data: Modalverben (7), next-page seven-word learning, successful quiz grading, completion status and admin import/status UI. The browser viewport override did not take effect, so this run does not establish mobile layout behavior.
- **No live database was written, no Hostinger access was performed, and MySQL/MariaDB execution against the deployed database remains unverified.** SQLite tests do not establish live server collation, storage or stored-transaction behavior. Database activation is pending the explicit admin action above.
