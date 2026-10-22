# Homework chapters 08 and 10–13

The existing Fast Track Homework library now offers Kapitel 08–13 in numeric
order. Kapitel 09 is unchanged. Speaking and Writing remain separate modules.
Authentication, enrollment, assignments, routes and database tables are unchanged.

## Content

| Generated file in `content/homework/intensive-a1-b1/` | Tasks | Sections |
| --- | ---: | ---: |
| `08-pronomen.txt` | 58 | 9 |
| `10-praepositionen.txt` | 71 | 9 |
| `11-feste-praepositionen.txt` | 51 | 8 |
| `12-zeitformen.txt` | 48 | 8 |
| `13-konjunktionen-und-konnektoren.txt` | 39 | 8 |

The five matching Markdown specifications in `Übung/` are the content sources.
Their earlier external Word worksheets are superseded by these specifications.
`tools/build-homework-chapters.js` reads all exercise tables, reading tasks and
tests, preserves their prompts, accepted variants and two hints, supplies solved
examples for the new controls, validates the result and writes the library files.
Run it after editing a source specification, then run `npm run check:homework`.
The normal admin source editor can also edit chapter JSON, but regenerating the
file will overwrite edits that were not reflected in the source or builder.

One supplied solved example was corrected: Kapitel 11, Übung 1 now uses
“Wir sprechen ___ das Projekt.” rather than “dem Projekt”, because the target
“über” requires Akkusativ here. Kapitel 12 T7 includes the two sentences being
compared so its concept-choice question is self-contained.

Digital adaptations from the specifications are preserved: possessive references
in Kapitel 08, separate grammar/meaning classification in Kapitel 10, the
explicitly derived Zeitformen and Konnektoren answers, and guided replacements
for free writing tasks. No runtime model/API grades grammar.

Choices use authored distractors. Two different contractions in Kapitel 10 R4
can be selected in any order. Kapitel 13 R2 requires all three subordinate
conjunctions. Kapitel 12 R1 requires both token marking and tense classification
and counts once. Repeated words and overlapping expressions (such as the two
“spricht” connections) are stored by occurrence rather than word text.

## Shared implementation

- `lib/homework-engine.js`: validates and grades the new types, handles their
  completeness and solutions, hides answer keys, and uses chapter-neutral failure
  wording. Existing state transitions and persistence are reused.
- `public/js/homework-learning.js`: choice controls, sentence tile banks,
  paired fields and combined reading/classification. Tiles support keyboard
  activation and drag into the editable field. Multi-step controls are checked
  explicitly when complete; existing end-of-section checking is retained.
- `public/css/homework-learning.css`: scoped styling for choices and wrapping
  tile banks using existing design tokens.
- `tools/check-homework-chapters.js`: 288 tests covering every accepted variant,
  source parity, counts, reading positions, key redaction, batch completion,
  restart, hints, reveal, review and JSON state round-trips.
- `package.json`: runs the new checks with the existing Homework suite and the
  full repository check command.
- `content/homework/README.md`: documents generation and assignment steps.

## Deployment and verification

Deploy/restart as usual. In Root admin → Homework → Give out homework, select
the desired chapters, batch and students and unlock them. Content discovery uses
the existing library loader. There is no additional migration, backfill or seed.
Existing Kapitel 09 progress is unaffected. New chapters become student-visible
only through the normal assignment/access process.

`npm run check` passes, including 353 Homework tests (65 existing plus 288 new).
JavaScript syntax checks and `git diff --check` pass. The repository does not
define lint, typecheck or build scripts; invoking those commands reports missing
scripts. No new toolchain was introduced for this content update.

Browser verification used the real EJS renderer and engine with a local
in-memory preview: paired grading and refresh, keyboard sentence building,
wrong/correct choices with hint status, multiple selection, combined reading
highlighting/classification, and 390px responsive layouts. No production data
was changed. Local MySQL is not configured, so live database persistence and
production assignment were not exercised; existing service/HTTP tests pass.
