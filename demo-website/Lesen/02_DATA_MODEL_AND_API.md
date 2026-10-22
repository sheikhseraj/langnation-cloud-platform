# Data Model and API Contract

> Important: these are target concepts, not mandatory table/route names. First inspect both repositories and adapt to the existing ORM, naming, migrations, controllers, service layer and API conventions.

## 1. Student Portal entities

### ReadingLesson

Suggested fields:

```text
id
slug
title
cefr_level              A1 | A2 | B1 | B2 | C1 | C2
summary                  nullable
content                  rich text / structured blocks
cover_image              nullable
status                   draft | published
sort_order
estimated_minutes        nullable
created_at
updated_at
published_at             nullable
```

Association to courses should follow the existing course/enrollment model. Do not create a parallel course model.

Possible junction:

```text
ReadingLessonCourse
- reading_lesson_id
- existing_course_id
```

### ReadingExercise

```text
id
reading_lesson_id
type                     multiple_choice | true_false | fill_blank
prompt
instructions              nullable
position
required                   boolean
hint                       nullable
explanation                nullable
support_anchor              nullable
config_json                 type-specific data
created_at
updated_at
```

Use `config_json` only if that matches the existing stack. If the project has typed models per exercise, follow that convention.

### ReadingAttempt

```text
id
user_id
exercise_id
attempt_number
answer_json
is_correct
used_hint
used_reveal
submitted_at
```

If the existing homework engine already stores attempts, strongly prefer extending/reusing it.

### ReadingProgress

```text
user_id
reading_lesson_id
status                     not_started | in_progress | completed
started_at
last_opened_at
completed_at
required_completed_count
required_total_count
```

A computed progress model is also acceptable if existing architecture avoids summary tables.

### SavedVocabulary

```text
id
user_id
dictionary_entry_key       stable ID/key from Dictionary
headword_snapshot
meaning_snapshot            nullable
target_language             nullable
source_lesson_id            nullable
source_selection            nullable
source_context               nullable
created_at
```

Recommended uniqueness:

```text
(user_id, dictionary_entry_key, target_language)
```

unless multiple context-specific saves are intentionally supported.

---

## 2. Dictionary API result contract

The Student Portal should normalize Dictionary results into a stable response such as:

```json
{
  "query": "Bewerbungsgespräch",
  "normalizedQuery": "Bewerbungsgespräch",
  "sourceLanguage": "de",
  "targetLanguage": "en",
  "matchType": "exact",
  "results": [
    {
      "id": "stable-dictionary-entry-id",
      "headword": "Bewerbungsgespräch",
      "displayHeadword": "das Bewerbungsgespräch",
      "partOfSpeech": "noun",
      "article": "das",
      "plural": "die Bewerbungsgespräche",
      "meanings": [
        {
          "text": "job interview",
          "language": "en"
        }
      ],
      "synonyms": [
        "das Vorstellungsgespräch",
        "das Interview"
      ],
      "examples": [
        {
          "source": "Ich habe ein Bewerbungsgespräch nächste Woche.",
          "translation": "I have a job interview next week."
        }
      ],
      "audioUrl": null,
      "fullDictionaryUrl": "https://langnation.de/..."
    }
  ]
}
```

Only return fields supported by the actual Dictionary data. Never invent article, plural, translation, example, audio or grammar data.

### No result

```json
{
  "query": "...",
  "normalizedQuery": "...",
  "sourceLanguage": "de",
  "targetLanguage": "en",
  "matchType": "none",
  "results": []
}
```

### Error handling

Student Portal should convert upstream failures into its own consistent response/status.

Recommended distinctions:
- 400 invalid query
- 401/403 only on Student Portal stateful endpoints where auth is required
- 404 is not necessary for an empty Dictionary search; 200 + empty results is easier for search UX
- 429 rate limited
- 502/503 Dictionary upstream unavailable

---

## 3. Recommended Student Portal endpoints

Adapt to existing routing conventions.

```text
GET  /api/portal/reading/lessons
GET  /api/portal/reading/lessons/:slug
POST /api/portal/reading/exercises/:id/submit
POST /api/portal/reading/exercises/:id/hint
GET  /api/portal/reading/progress

GET  /api/portal/dictionary/lookup?q=...&target=en
POST /api/portal/vocabulary
DELETE /api/portal/vocabulary/:id
GET  /api/portal/vocabulary
```

Do not trust `user_id` from the request body. Resolve it from the authenticated session/token.

---

## 4. Dictionary bridge

Recommended internal flow:

```text
DictionaryController (langnation.com)
  -> DictionaryClient service
      -> HTTP call to langnation.de Dictionary API
      -> timeout
      -> retry only safe idempotent failures
      -> normalize response
      -> cache
  -> frontend DTO
```

Use a short upstream timeout (for example 2–5 seconds depending on existing conventions) so a Dictionary outage does not hang the lesson.

### Cache key

```text
dictionary:<source>:<target>:<normalized-query>
```

Do not cache authenticated student-specific data in the same cache object.

---

## 5. Selection normalization

Client keeps both:

```text
rawSelection      exact text student selected
lookupSelection   normalized value for dictionary lookup
```

Recommended single-word normalization:
- Unicode normalize according to project conventions;
- trim leading/trailing whitespace;
- remove leading/trailing sentence punctuation;
- preserve internal hyphens/apostrophes;
- preserve German characters;
- do not blindly lowercase if Dictionary search uses case for nouns; let backend search logic decide.

Do not stem/lemmatize independently in two applications. If the Dictionary already handles inflected forms, keep that logic in the Dictionary service.

---

## 6. Exercise config examples

### Multiple choice

```json
{
  "options": [
    {"id": "a", "text": "Bananen"},
    {"id": "b", "text": "Tomaten"},
    {"id": "c", "text": "Erdbeeren"},
    {"id": "d", "text": "Rosen"}
  ],
  "correctOptionId": "a"
}
```

Correct answers must not be exposed to an untrusted client before submission if the current architecture supports server-side checking.

### True/False

```json
{
  "correct": true
}
```

### Fill blank

```json
{
  "acceptedAnswers": ["weiß"],
  "caseSensitive": false,
  "trimWhitespace": true
}
```

If accepted answers are sensitive, validation stays server-side and the client receives only what is needed to render.

---

## 7. Versioning

If a new public/read-only Dictionary API is added, version it from the beginning (`/api/v1/...`) unless the existing application has another established versioning scheme.

Do not couple Student Portal components to Dictionary DB schema names. Couple them to the API/service contract.
