# Homework, as text

## Self-learning chapters

The same library, admin source editor, assignments and student routes also accept
structured chapters: keep the `# Chapter title` first line, add an `@learning`
line, then JSON. `intensive-a1-b1/09-negation.txt` is the complete example.
The parser validates this configuration before saving. Each section defines its
short label, full title, instruction, solved examples and countable questions.
Each question defines a stable ID, a supported type, two hints, accepted variants
and explanatory feedback. Highlight questions define occurrence-specific token
groups; categorization defines item IDs and categories. Examples never count.
Speaking and Writing are not part of this engine.

The Fast Track library now contains Kapitel 08–13 in numeric order. Kapitel 08,
10, 11, 12 and 13 are generated from the matching Markdown specifications in
`Übung/` by `node tools/build-homework-chapters.js`. Keep those five Markdown
files in source control if rebuilding or running the transcription checks.
Runtime reads only the generated `.txt` files. These chapters add 267 tasks:
58 Pronomen, 71 Präpositionen, 51 Feste Präpositionen, 48 Zeitformen and
39 Konjunktionen und Konnektoren. Examples never affect these totals.

The engine additionally supports `choice`, `multi_select` (a configured number
of distinct valid choices), `sentence_builder`, `sentence_builder_choice`,
`word_order`, `sentence_connector`, `paired_sentence_transform` and
`highlight_categorize`. Sentence tiles support clicking, keyboard activation
and dragging into an editable answer; checking remains deterministic.
Paired sentences and combined highlighting/classification count as one task.
Answer keys and target token positions stay on the server until solution reveal.

Deploy these files, then use Root admin → Homework → Give out homework to
select the new chapters, batch and students. Existing access rules still apply;
deploying content does not automatically grant students new assignments.
No additional database migration or Kapitel 09 upgrade command is required.
See `docs/homework-chapters-08-13.md` for content notes and verification.

Migration `36_homework_learning.sql` adds JSON configuration and learning state
to the existing `exercises` and `exercise_attempts` tables. It is automatically
picked up by the existing startup migration runner. Historical answer rows are
preserved. After deploying, upgrade already-assigned Kapitel 09 rows with:

```sh
node tools/upgrade-homework-learning.js          # inspect matching assignments
node tools/upgrade-homework-learning.js --apply  # attach the new configuration
```

The upgrade changes neither enrollment nor unlock lists. Historical results stay
available; legacy answers are not inferred as learning-engine progress because
the previous chapter had different questions and no hint/reveal records. New
assignments use the structured chapter automatically through Give out homework.
Existing assignments can also be refreshed there.

For a new chapter, copy the structure into another `.txt` file in its workbook,
choose a unique chapter key and stable question/section IDs, then edit content in
the same admin editor. Create a new chapter when replacing the question set entirely;
do not reuse an ID for a different question. Run `npm run check:homework` and
`npm run check:exercises`. Add variants deliberately: the evaluator preserves
spelling and umlauts, with capitalization treated as an orthography warning.
No external API or model judges answers.

Drafts, attempts, hints, reveals, four-color status, the current section and the
review queue are persisted on the authenticated server. Revision checks prevent
two tabs from silently overwriting progress. Save failures leave inputs visible.

One folder per workbook, one file per chapter. These are the source
for the exercises in the student portal — the same text the Homework
editor in Root admin shows in its box.

They live here rather than only in the database for three reasons: they
travel with a deploy, they are readable in a diff when a question
changes, and a database that has to be restored does not take a term's
homework with it.

## One book per course

The school teaches two programmes out of two different sets of
chapters, so a folder names the course it belongs to, in
`workbook.json`:

    { "course": "german-regular-a2", "sort": 20 }

Everything a person reads comes from the catalogue: the title the
Courses page shows, the programme it sits under, its level. One source
of truth, so a book cannot come to be called something the course page
does not call it — and so "put this in Regular, German A2" is one slug
rather than three fields kept in step by hand. A slug that is not in
the catalogue is printed as an error rather than quietly used.

Three optional fields:

    "title"  overrides the course's own name
    "level"  for a course the catalogue gives no single level — Fast
             Track is A1–B1
    "sort"   teaching order, which neither the slugs nor the titles give

A folder with no manifest at all still works and is named after
itself, because a book that will not appear until somebody writes a
JSON file is a book somebody loses.

    regular-a1 … regular-c2     German Regular A1–C2, one book each
    intensive-a1-b1             Fast Track A1–B1

A1, A2 and B1 hold the Regular workbook, split across them by level.
B2, C1 and C2 have a manifest and no chapters yet — slots, so there is
one obvious place to put each workbook when it is written. A book with
no chapters in it is not offered anywhere.

## Giving somebody a whole book

Root admin → Give out homework has a **Book** dropdown beside the level
one, grouped by programme in the catalogue's order — so it reads the
way the Courses page reads. Choose a book, press **Select all**, tick
the people, Unlock. Select all has always meant *all of what is on
screen*, so that is the whole of it.

The two cuts narrow together: book **and** level, not one or the
other. And a chapter you have ticked stays visible whatever the
filters then say, marked as kept from another one — nothing is ever
ticked where you cannot see it.

A student can hold any number of books. Somebody enrolled on Regular
A1 who should also be practising A2 is given both; the grant is per
person and owes nothing to what they are enrolled on.

## Where they came from

### The Regular books

`regular-a1/`, `regular-a2/` and `regular-b1/` were read out of the
school's own Word workbook, `LangNation_Grammatik_A1-B1_2026.docx`, by
`tools/import-workbook.js`, and then split by level — the workbook
runs A1 to B1 in one volume and the courses do not. Every answer comes
from the Lösungen table at the back of that book. Nothing was written
by the importer, and a question whose answer could not be found or did
not fit its gaps was left out and named on the run rather than guessed
at.

The chapter TITLES still carry their level — "A1 · Kapitel 01 — …" —
and were deliberately not rewritten when the files moved. Homework
already given out is matched to its chapter by title, so renaming them
would orphan every piece of it.

### The Intensive book

`intensive-a1-b1/` is the Fast Track material, which is a different
set of chapters written as one document each rather than one volume.
`tools/import-chapter.js` reads that layout:

    node tools/import-chapter.js "9_Negation_Übung.docx" --out content/homework/intensive-a1-b1

Same rule, and it is the half that matters: answers come from the
chapter's own Lösungen section, matched to items by position, and
anything that does not line up is reported and left out. An Übung
whose answer count does not match its item count is dropped whole —
one answer short and every answer after it attaches to the wrong
sentence, which marks a student wrong for being right and looks
completely fine on the page.

Rewriting tasks ARE imported now, and they are not marked. "Korrigiere
den Fehler", "Verbinde mit weder … noch" — the student writes, asks to
see the teacher's version, and gets it labelled as one correct way of
doing it. Nothing is scored, which is the only reason it can exist: a
model answer marked as *the* answer fails somebody who wrote different,
correct German.

## Pages

Each Übung is a page, and the reading text is the last one.

    ## Übung 1 – nicht oder kein?     a new page, under this heading
    # Ergänze die passende Form.      what THIS page asks for
    Ich habe ___ Auto.
    = kein

    ## Übung 3 – Stellung von nicht
    Ich fahre morgen mit dem Auto. (mit dem Auto)
    ~ Ich fahre morgen nicht mit dem Auto.      one correct version

A chapter with no `##` in it is one page and reads exactly as it did.
With them, the student gets one Übung at a time and a **Weiter**
button — and, with JavaScript off, the whole worksheet on one page,
which is what it was before.

`###` is not the spelling for a page instruction and cannot be: `##`
matches it, so a three-hash line opens a page named after the
instruction. One hash inside a page is that page's instruction.

    43 chapters read
    246 of 258 Übung A questions converted
    96 Übung B questions deliberately NOT converted
    12 left out, each with a reason printed

The 96 are transformation tasks — "Aktiv → Passiv", "Beginne mit dem
Ort". The workbook says on its first page that they have several right
answers, so marking one model answer as *the* answer would fail a
student who wrote a different correct sentence. The 12 are word-order
tasks, for the same reason.

## Reading them

Three markers, and the kind of question is read from which one is used:

    Ich ___ Student.         a gap, with options under it
    * bin                    the * marks the right one
      bist
    > why, shown after answering

    Sie ___ aus Italien.     a gap and a typed answer
    = kommt
    = kommt|kommen           more than one answer accepted

    Ich [bin|bist] Student.  a dropdown inside the sentence

`! /img/…` puts a picture above a question, `#` is the title and then
the instruction, and a `~~~` block is a reading text.

The full rules, including what counts as a right answer in German, are
in `lib/exercise-format.js`. The short version: umlauts spelt out are
accepted (`gruen` for `grün`), and a capital is only required where the
expected answer has one — so a noun has to be capitalised and a verb at
the start of a sentence does not.

## Loading them

    node tools/load-exercises.js content/homework/regular-a1 --batch 12

`--batch` is the id from Root admin → Batches, in the address bar.
Nothing is written until every file has parsed, so a bad chapter stops
the run rather than leaving half of them loaded. Run it again and it
updates rather than duplicating, matched on title.

By default they load as drafts that nobody can see. Add `--publish` to
give them to the batch, or unlock one for yourself in Root admin →
Homework and try it first.

## Adding another workbook

    node tools/import-workbook.js path/to/workbook.docx --out content/homework/regular-a2

Then write its `workbook.json`, or it will be offered under its folder
name.

It only understands the layout these workbooks use — chapter heading,
Übung A, Übung B, and one Lösungen table per chapter at the back. A
document laid out differently comes back with nothing converted and
says so, which is the right failure: silently importing half a book is
worse than importing none of it.
