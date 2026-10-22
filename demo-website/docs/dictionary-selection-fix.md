# Dictionary selection follow-up

## Status

Website and Dictionary changes are implemented locally. The active local Dictionary Git
checkout is `C:/Users/sheik/My_Porject/LangNation Dictionary/Web/langnation-dictionary-v23`,
on `main`, connected to `sheikhseraj/langnation-dictionary`. Its latest existing commit was
`a63f0c3` (October 5, 2026); v22 is an older folder without Git. The reviewed patch was applied
to the clean v23 checkout and its complete `npm test` suite passed (54 tests).
`docs/patches/dictionary-selection-fix.patch` is retained as a record; do not apply it again.
Deploy the updated Dictionary backend before this website: Translate uses its new endpoint.
The revision currently running on Hostinger has not been verified.
Nothing has been committed, pushed or deployed by this work.

## Cause and correction

The Dictionary searched serialized past/perfect forms using SQL substring matches, omitted
present-tense forms and selected the 12 most popular candidates before linguistic ranking.
Word-family expansion and headword-only sorting could not recover an omitted base verb.

The backend fix retrieves present, past, participle and noun/adjective candidates,
parses stored morphology, ranks whole forms before limiting results, then ranks expanded
family entries again. Popularity cannot override a better linguistic match. Exact headword,
normalized headword, exact inflection, contextual split form, prefix, substring and remaining
related entries have distinct priorities. It does not guess lemmas by removing endings.
NFC/case/punctuation normalization preserves umlauts and ÃŸ. Stored perfect principal parts
also support participle lookup when older records lack a separate partizip2 field.

Contextual `sehe â€¦ an` and `sehe â€¦ entgegen` use stored split forms and a sentence-final
particle; they remain secondary to an exact stored base-verb form. New cache keys avoid old
in-memory ordering and distinguish contexts. Existing English lookup remains supported.

## Website files

- `lib/dictionary-ranking.js`: generic ranking for morphology returned by the upstream API.
- `lib/dictionary-client.js`: contextual lookup/cache and a distinct bounded translation client.
- `routes/reading.js`: authenticated, rate-limited, CSRF-protected translation route; bounded lookup context.
- `public/js/dictionary-text.js`: reusable German sentence-boundary and token helpers.
- `public/js/reading-popover.js`: separate Meaning/Translate actions, paragraph-bounded sentence ranges,
  temporary sentence selection, original-selection restoration, independent Listen/Save behavior,
  cancellation and retry, DE/EN presentation, and active toolbar state.
- `public/css/dictionary-popover.css`: compact translation typography using existing theme colors.
- `views/partials/dictionary-popover.ejs`: loads the shared sentence helper everywhere the toolbar appears.
- `package.json`: includes ranking and sentence regression tests in existing checks.
- `tools/check-dictionary-ranking.js`, `tools/check-dictionary-text.js`: morphology and boundary regressions.
- `tools/check-dictionary-client.js`, `tools/check-reading.js`: service contracts, errors, context caches,
  authentication, CSRF, validation and rate limits.
- `tools/check-dictionary-browser.cjs`: UI/selection/Listen/Save/translation and responsive screenshot checks.
- `tools/preview-reading.js`: explicit local translation fixtures and consistent fixture CSRF setup.
- `tools/check-reading-browser.cjs`: updated expected article-bearing fixture headword.

## Dictionary files changed in v23

- `vocabulary-lookup.js`: retrieve omitted forms and rank before limits/family expansion.
- `dictionary-ranking.js`: the same pure linguistic ranking rules.
- `dictionary-api.js`: ranked metadata and `/api/v1/dictionary/translate`, which rejects unrelated glosses.
- `server.js`: reuse the existing cache/database/provider pipeline for complete translation;
  preserve sentence punctuation, partition caches, and suppress word-family expansion for translation.
- `tests/dictionary-ranking.test.cjs`: requested word regressions, candidate retrieval beyond the old
  12-row limit, contextual compounds and the real versioned translation HTTP contract.

## Regression results

All requested mappings pass against stored-form fixtures:

| Queries | Primary result |
| --- | --- |
| schreibe, Schreibe, schreibe, (with trailing punctuation) | schreiben |
| sehe, siehst, sieht, gesehen | sehen |
| gehe, ging, gegangen | gehen |
| arbeite, arbeitet | arbeiten |
| lernst | lernen |
| macht | machen |
| verschreiben, beschreiben, ansehen, entgegensehen | Each exact headword |

Sentence tests cover the requested Regenbogen/GemÃ¼se paragraph, phrase selections, `. ! ?`,
quotes, Dr., z. B., dates and sentence-final abbreviations. Browser checks use the real
templates/routes with explicitly simulated upstream services; these are not live translation
or production MySQL results. The five screenshots are labelled 01 through 05 in the chat's
visualization directory. Existing reading browser checks also pass.

Verification completed: full `npm run check` passed, including 69 reading/dictionary tests; 54 tests in the actual v23 Dictionary checkout passed; both browser regression scripts passed. The patch passed `git apply --check` against v23.

Run `npm run check` in the website. No separate lint, TypeScript or build scripts exist;
JavaScript syntax, EJS rendering and the repository check suite are used. The updated v23 backend
passes its complete test suite, including the new ranking tests. Live stored-form completeness,
SQL execution against production MySQL and provider output remain deployment smoke checks.

## Database and environment

No schema migration, new table, new environment variable or new provider is required. Keep
the existing Dictionary base URL, service key, timeout and Dictionary provider credentials.
The new translation endpoint reuses the existing Dictionary translation/provider pipeline.
Do not deploy the website translation client without the corresponding backend patch.
