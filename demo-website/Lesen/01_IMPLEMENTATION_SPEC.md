# LangNation Lesen + Dictionary Integration
## Product and Technical Implementation Specification

## 1. Goal

Add an interactive **Lesen** learning area inside the existing LangNation student portal on `langnation.com`.

Students should be able to:

- open reading lessons assigned to/enabled for their enrolled course and CEFR level;
- read a paragraph or longer text;
- select or tap German vocabulary directly inside the text;
- open a compact LangNation-styled vocabulary panel;
- see results from the existing `langnation.de` Dictionary;
- hear pronunciation when available;
- translate a selected phrase where existing Dictionary/translation capabilities support it;
- save vocabulary to their LangNation student vocabulary list;
- complete interactive reading exercises with immediate feedback, hints and retry;
- see lesson completion and progress.

The feature should feel like a native part of LangNation, not like a separate product embedded inside the portal.

---

## 2. Existing systems

### Main website / Student Portal
`https://www.langnation.com/`

Use it for:
- student authentication;
- course enrollment / access control;
- reading lesson delivery;
- exercise answers and progress;
- saved vocabulary per student;
- student-facing progress UI;
- admin/teacher reading content management if an admin system already exists.

### Dictionary
`https://langnation.de/`

Use it as the source of truth for:
- German headword;
- article/gender;
- plural;
- meanings/translations;
- synonyms/word family where existing data supports them;
- example sentences;
- pronunciation/audio;
- declension/conjugation where existing data supports them.

Do not duplicate the entire Dictionary dataset in the main website.

---

## 3. User journey

### 3.1 Student navigation

Use the current Student Portal navigation and add a native learning entry such as:

```text
My Course
  ├─ Homework
  ├─ Lesen
  ├─ Payments
  ├─ Certificates
  └─ Progress
```

Exact placement must follow the existing portal IA after repository inspection.

### 3.2 Lesen overview

The student sees lessons they can access, grouped/filterable by CEFR level and course.

Example card:

```text
A1 · Lesen 01
Die Farben
5 Aufgaben · ca. 8 Min.
Progress: 60%
[Weiterlernen]
```

Recommended lesson states:
- Not started
- In progress
- Completed
- Locked / not enrolled (only if existing portal patterns use locked content)

### 3.3 Reading lesson

Recommended order:

1. Breadcrumb / course context
2. CEFR level + lesson title
3. Optional lesson cover image
4. Reading instructions
5. Reading text
6. Vocabulary interaction from selected/tapped text
7. Exercises
8. Completion result
9. Next lesson / retry actions

---

## 4. Interactive vocabulary behavior

### 4.1 Desktop

When a student selects text inside the reading passage, show a small contextual toolbar above/below the selection:

```text
[Meaning] [Translate] [Listen] [Save]
```

Behavior:
- trim whitespace;
- preserve umlauts and ß;
- strip surrounding punctuation for single-word lookup;
- keep the original selected phrase for phrase translation;
- do not trigger lookup for an empty selection;
- cap selection length (recommended 250 characters for popup interaction);
- clicking outside closes the toolbar/panel;
- Escape closes the panel;
- stale network requests are cancelled.

### 4.2 Mobile/tablet

Support both:
- tap a word for quick lookup;
- native long-press/select for a phrase, followed by contextual actions.

Do not prevent normal scrolling or browser text selection.

### 4.3 Single word vs phrase

#### Single word
Primary action = **Meaning**.

Lookup flow:
1. exact selected surface form;
2. existing Dictionary normalization/lemmatization if available;
3. show best result plus alternatives if ambiguous.

#### Phrase / sentence fragment
Primary action = **Translate**.

If the existing Dictionary backend supports phrase/context translation, reuse it. Do not add a new paid AI/translation provider without explicit approval.

If phrase translation is not currently available:
- show a graceful "Phrase translation is not available yet" state;
- keep per-word Dictionary lookup working.

---

## 5. Vocabulary result panel

The panel should visually reference the current LangNation Dictionary design while remaining compact enough for the Student Portal.

For a result like `Bewerbungsgespräch`, display available fields such as:

```text
das Bewerbungsgespräch
job interview

Example
Ich habe ein Bewerbungsgespräch nächste Woche.

Word family
Noun: das Bewerbungsgespräch | die Bewerbungsgespräche
Synonyms: das Vorstellungsgespräch | das Interview

[Listen] [Save word] [Open full Dictionary ↗]
```

Do not show empty sections.

### Panel states
- loading skeleton;
- exact result;
- multiple matches;
- no result;
- Dictionary temporarily unavailable;
- saved / already saved.

### Full Dictionary deep link
Provide an optional "Open full Dictionary" action that opens the corresponding `langnation.de` search/result in a new tab.

---

## 5.5 One reusable lesson template

Implement a single data-driven Lesen lesson renderer for all CEFR levels. Lesson-specific text, images, questions, options, answer keys, hints and feedback must come from lesson data/database records, not from lesson-specific frontend components.

The canonical reference shape is `04_REUSABLE_READING_TEMPLATE.json`. The real A1 `Die Farben` pilot in `04_PILOT_DIE_FARBEN.json` must use the same renderer and storage model as all future lessons. See `04A_EXERCISE_ANSWER_RULES.md` for mandatory complete answer-key rules.

## 6. Reading exercises

### MVP exercise types

1. Multiple choice
2. True / False
3. Fill in the blank

Data architecture should be extensible for later:
- matching;
- word ordering;
- sentence ordering;
- short answer;
- vocabulary categorization;
- drag & drop.

### Immediate feedback pattern

On submit:

**Correct**
```text
✓ Richtig!
Short explanation if configured.
[Weiter]
```

**Incorrect**
```text
Noch nicht richtig.
[Hinweis] [Noch einmal versuchen]
```

After configured failed attempts, optionally show:
```text
[Im Text anzeigen]
```
which highlights the supporting sentence/paragraph.

### Hint-assisted status
Track whether an answer was completed:
- first try;
- after retry;
- with hint;
- after reveal.

Do not treat all completion states as the same in analytics.

### Completion

At the end show, for example:

```text
Lesen abgeschlossen!
5/5 Aufgaben erledigt
4 beim ersten Versuch
2 neue Wörter gespeichert

[Noch einmal üben] [Nächstes Lesen]
```

---

## 7. Access control

Reading lessons live in the Student Portal and must use the existing access model.

Rules:
- unauthenticated user: redirect/use existing sign-in behavior;
- authenticated but not entitled: use existing course-access behavior;
- entitled student: show lesson;
- teacher/admin preview: follow existing roles/permissions.

Do not create a second authentication mechanism for Lesen.

Dictionary lookup itself can remain a public/read-only service, but saved vocabulary requires the authenticated Student Portal user.

---

## 8. Progress tracking

Track at minimum:
- lesson started_at;
- lesson last_opened_at;
- lesson completed_at;
- exercise attempts;
- selected answer/value;
- correct/incorrect;
- hint used;
- reveal used;
- score/summary if the existing portal uses scores.

Recommended progress rule:
- lesson becomes `completed` when all required exercises are completed;
- dictionary lookups are never required for completion.

Save progress automatically after each exercise.

---

## 9. Saved vocabulary

Add a student vocabulary collection, preferably exposed later as **Meine Vokabeln**.

Store a reference to the Dictionary entry, not a duplicate of the complete entry.

Recommended fields:
- user_id
- dictionary_entry_id or stable dictionary key
- headword snapshot
- short meaning snapshot
- source_lesson_id
- source_selected_text
- source_sentence / source context (optional)
- target_language (if relevant)
- created_at

Why keep a small snapshot:
- fast list rendering;
- understandable saved record if a Dictionary entry is later edited;
- still allows opening the latest Dictionary result using the stable ID/key.

Prevent duplicate saves for the same student + dictionary entry + language unless the product intentionally supports multiple contexts.

---

## 10. Content authoring

Do not hardcode lessons into React/UI components.

Lessons should come from the existing database/content system if possible.

A reading lesson needs:
- ID / slug
- title
- CEFR level
- course association(s)
- status: draft/published
- sort order
- reading content
- optional image
- exercises
- explanations/hints
- source-support ranges for "Im Text anzeigen" where used.

If the project already has an admin CMS/content editor, extend it instead of building a separate admin application.

### Rich text safety
If lesson content supports HTML/rich text:
- sanitize server-side;
- allow only needed tags;
- avoid raw untrusted HTML injection.

---

## 11. Recommended architecture between the two domains

### Preferred: Backend-for-Frontend proxy

Browser:
```http
GET /api/portal/dictionary/lookup?q=Bewerbungsgespr%C3%A4ch&target=en
```

Student Portal backend calls:
```http
GET https://langnation.de/<existing-or-new-read-only-dictionary-api>
```

The main website returns a normalized result to its frontend.

Advantages:
- no cross-domain auth/cookie complexity;
- no Dictionary database credentials in main frontend;
- stable Student Portal response contract;
- centralized cache and error handling;
- easier to change Dictionary internals later.

### Fallback: direct browser API
Only use if repository inspection shows this is more natural.

Then configure:
- strict CORS allowlist;
- `https://www.langnation.com` and required development origins only;
- no wildcard origin for credentialed requests;
- rate limiting;
- CSP `connect-src` updates if required.

---

## 12. Dictionary API strategy

Before adding endpoints, inspect `langnation.de` for existing routes/services used by its own search page.

**Reuse existing search/business logic. Do not reimplement Dictionary search in the main site.**

If a new endpoint is necessary, create a small versioned read-only API, for example:

```text
GET /api/v1/dictionary/lookup?q=<text>&source=de&target=en
```

The exact route should conform to the existing Dictionary project conventions.

The endpoint should return stable IDs/keys and only fields required by the Student Portal.

See `02_DATA_MODEL_AND_API.md`.

---

## 13. Performance

- debounce only where needed; contextual selection lookup may start immediately on explicit click;
- abort stale lookup requests;
- cache Dictionary responses by normalized query + target language;
- recommended server cache TTL: 1–24 hours depending on existing edit frequency;
- client cache for current session to avoid repeated calls for the same word;
- lazy-load noncritical reading interactions if bundle size is a concern;
- do not block lesson rendering while Dictionary services load.

---

## 14. Security and privacy

- no Dictionary DB credentials in browser code;
- validate query length and encoding;
- parameterized DB queries in Dictionary service;
- server-side rate limits;
- sanitize any rendered HTML;
- CSRF protection for state-changing Student Portal requests according to existing stack;
- save vocabulary and progress only for the authenticated user;
- never trust user-supplied user IDs;
- authorization checks on every lesson/progress route;
- avoid logging full sensitive student data;
- add audit fields using project conventions.

---

## 15. Accessibility

At minimum:
- keyboard-accessible vocabulary toolbar;
- visible focus state;
- Escape closes popup;
- ARIA labels for audio/save/actions;
- popup uses correct dialog/popover semantics;
- color is not the only correctness indicator;
- touch targets ~44 px where practical;
- proper heading hierarchy;
- exercise feedback announced to screen readers where applicable.

---

## 16. Responsive behavior

### Desktop
- floating contextual toolbar;
- result as anchored popover/card when room permits.

### Small screens
- compact action bubble after word tap/selection;
- result opens in bottom sheet / modal drawer;
- scrolling remains usable;
- long text and German compound words wrap cleanly.

---

## 17. Analytics (privacy-conscious)

Useful events:
- reading_lesson_opened
- reading_lesson_completed
- reading_exercise_submitted
- reading_hint_used
- reading_answer_revealed
- dictionary_lookup
- dictionary_lookup_no_result
- vocabulary_saved

Do not send the full reading passage or unnecessary personal data to analytics.

---

## 18. Error states

Dictionary API unavailable:
```text
Dictionary is temporarily unavailable.
You can continue the lesson and try the word again later.
```

No result:
```text
No exact Dictionary entry found for “...”
[Search full Dictionary ↗]
```

Progress save failure:
- keep answer state locally for the current page session;
- show a non-destructive retry message;
- do not falsely show persisted completion.

---

## 19. MVP scope

### Must ship
- native Lesen area inside Student Portal;
- lesson list/detail;
- pilot A1 lesson;
- word/phrase selection interaction;
- Dictionary result from `langnation.de`;
- pronunciation when API provides it;
- open full Dictionary link;
- MCQ + T/F + fill blank engine architecture;
- immediate feedback, hint and retry;
- progress persistence;
- enrollment/auth checks;
- responsive UI;
- tests.

### Strongly recommended in same implementation if straightforward
- save vocabulary;
- Meine Vokabeln list;
- source sentence/context;
- highlight supporting text after failed attempts.

### Later phases
- personalized flashcards;
- spaced repetition;
- auto-generated revision sets from saved words;
- teacher analytics;
- content recommendation;
- AI-generated explanations (only with explicit product rules and validation).

---

## 20. Pilot content

Use the attached `Die Farben (A1)` material as the first acceptance-test lesson. The structured fixture is in `04_PILOT_DIE_FARBEN.json`.

Do not bulk-import legacy PDFs automatically. The goal of the pilot is to prove the reusable reading + exercise + Dictionary architecture first.

---

## 21. Definition of done

The feature is done when:
- an enrolled student can open the A1 pilot lesson;
- the reading text loads without depending on the Dictionary;
- selecting/tapping a German word can open a LangNation-styled result from the real Dictionary backend;
- phrase action behaves gracefully even if translation is not supported;
- exercises provide feedback/retry and persist progress;
- completion persists across logout/login;
- mobile behavior is usable;
- no duplicate Dictionary dataset was created;
- existing auth, enrollment, routes and unrelated pages continue to work;
- automated tests and manual acceptance checks pass.
