# Reusable Lesen Template — Question and Answer Rules

This file is mandatory for every Lesen lesson. The goal is that the same lesson template works for A1 through C2 and that answer checking is deterministic, reviewable and safe.

## 1. One reusable lesson structure

Do not create a custom React page/component for each reading lesson. Build one reusable Lesen lesson renderer that receives lesson data from the database/API. Every lesson should use the same core structure:

1. level/course context;
2. title and optional cover image;
3. instructions;
4. reading blocks;
5. Dictionary interaction on the reading text;
6. exercises;
7. immediate feedback, hint, retry and support reveal;
8. completion/progress.

`04_REUSABLE_READING_TEMPLATE.json` is the canonical content shape. Adapt field names only if the existing LangNation data model has a better established convention.

## 2. Every question must contain a complete answer definition

No exercise may be published without a complete answer key.

### Multiple choice
Store every answer option that the student can choose and the complete set of correct option IDs.

Example:

```json
{
  "options": [
    {"id": "a", "text": "Bananen"},
    {"id": "b", "text": "Tomaten"},
    {"id": "c", "text": "Erdbeeren"},
    {"id": "d", "text": "Rosen"}
  ],
  "answerKey": {"correctOptionIds": ["a"]}
}
```

Support more than one correct option in the data model even if the initial UI mostly uses one-correct-answer MCQs.

### True / False
Store the exact Boolean answer.

### Fill in the blank
Store **all intentionally accepted correct variants** in `acceptedAnswers`. Do not rely on AI at runtime to decide whether a response is correct.

Examples of variants that may be intentionally accepted when pedagogically equivalent:
- capitalization differences, if configured case-insensitive;
- the same answer with/without final punctuation;
- a full phrase and a clearly equivalent short phrase, when the lesson author explicitly approves both.

Do not automatically accept spelling mistakes, different grammatical forms, synonyms or article changes unless the lesson author explicitly configures them.

### Short answer
For MVP, use a deterministic list of approved `acceptedAnswers` plus normalization rules. If a future semantic/AI grader is added, it must be a separate optional feature and must not replace the stored model answer/accepted-answer list.

### Multi-select / matching / ordering later
Design the schema so future exercise types can define a complete deterministic answer key:
- multi-select: `correctOptionIds[]`;
- matching: full pair mapping;
- word/sentence order: complete correct sequence(s);
- categorization: item-to-category mapping.

## 3. Feedback is part of the lesson data

Each exercise should support:
- correct feedback;
- incorrect feedback;
- short explanation/model answer;
- one or more progressive hints;
- exact supporting passage or block reference;
- maximum attempts / reveal threshold.

The generic UI renders these fields. Do not hardcode lesson-specific feedback inside components.

## 4. Validation before publish

The admin/content workflow must reject or flag a lesson if:
- an exercise has no prompt;
- MCQ has fewer than 2 options;
- MCQ has no correct option;
- a correct option ID does not exist in the option list;
- fill-blank/short-answer has no accepted answer;
- support anchor refers to a missing reading block;
- two exercise IDs collide;
- positions collide or are invalid.

Prefer server-side schema validation plus typed frontend validation if the current stack supports it.

## 5. Do not expose answer keys unnecessarily

Renderable question data may be sent to the browser, but correct answers should remain server-side until/after submission where practical. The submit endpoint validates the answer and returns feedback/progress. Do not place all correct answers in page source if the current architecture can avoid it.

## 6. Pilot requirement

`04_PILOT_DIE_FARBEN.json` is the first real lesson and must be loaded through the **same reusable template/renderer** used by all future lessons. It is not a special one-off page.
