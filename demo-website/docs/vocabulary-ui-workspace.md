# Meine Vokabeln UI and learning workspace

Implemented in LangNation_Web_V03, 8 October 2026.

## Result

The dashboard follows the supplied cream, beige and navy Homework references. It keeps the existing student profile and portal navigation, uses consistent inline SVG icons, and shows actual vocabulary totals, mastery, streak and daily practice. Separate cards offer a daily goal or systematic level/block learning. All six levels, taxonomy filters, reset, search and personal collections remain available.

Daily goals support presets 5/10/15/20 and custom values 1–100. More adds five; completing a goal offers the next ten without resetting progress. Today's distinct practiced words count once across modes using the Berlin calendar day. Daily sets prioritize due, difficult and new words and fill only the remaining target. Blocks contain up to 50 actual dictionary entries, including a partial final block.

The workspace keeps global navigation, adds block navigation, displays one active word, and places progress on the right on wide screens. Every mode has the shared My vocabulary / Dashboard breadcrumbs and Previous / repeat or replay / Next controls. Mode switching retains the current set and position.

## Four modes

- Lernen shows source meaning, forms, usage, example and translation where available. Again, Difficult and Known persist through existing student progress.
- Flashcards hide meanings, examples and ratings until the card is flipped. Keyboard flipping is supported; moving to another card restores the front.
- Quiz uses four unique dictionary meanings with opaque option IDs. The server grades choices, prevents retries from awarding duplicate credit, and returns correct/wrong feedback. Insufficient distinct source meanings produce an unavailable state rather than invented choices.
- Schreiben asks for the German word from its English meaning. The server checks the answer, supports hint/reveal and preserves umlauts and formal Sie. Noun article omission is accepted only for noun questions. Revealed/skipped answers do not receive correct credit.

Existing mini dictionary components provide Meaning, Translate, Listen, Save and full dictionary links. Main terms support whole-phrase lookup; examples keep existing selection behavior. Saving in the popup updates the corresponding vocabulary control. Audio uses available source audio or a local browser speech voice; unavailable audio disables gracefully.

## Architecture and files

Templates: views/pages/portal/vocabulary.ejs, vocabulary-workspace.ejs; shared vocabulary-shell-head.ejs and vocabulary-breadcrumbs.ejs.

UI: public/css/vocabulary.css; public/js/vocabulary-dashboard.js, vocabulary-learning.js, vocabulary-ui.js and study-icons.js. Existing dictionary-popover CSS/template, reading-popover.js and dictionary-page.js supply the reused dictionary behavior.

Backend: routes/vocabulary-learning.js, lib/vocabulary-workspace.js and lib/vocabulary-practice.js. Existing vocabulary-dashboard, vocabulary-learning, vocabulary-domain and vocabulary-quiz modules now support custom goals, shared progress and writing checks. routes/reading.js allows the existing bookmark flow in the vocabulary module.

New endpoints under /portal/vocabulary: GET blocks, GET session, POST practice, POST practice/answer, and GET learn. Existing authentication, student ownership, CSRF and request quotas apply. Canonical dictionary content stays in the dictionary service. Practice persistence contains references, hashes, opaque IDs and results; it does not copy lexical definitions into a new database.

## Database and deployment

No new migration, SQL import, table or column is required for this UI release. It reuses the previously implemented student progress/settings tables and existing quiz session/activity persistence (website migrations 42 and 43). Push the website changes through the existing GitHub deployment workflow. The dictionary repository and deferred curriculum review are unchanged.

## Responsive behavior and validation

Global and inner navigation fold on smaller screens. The progress list moves below the exercise; controls wrap and large tap targets remain available. Mobile footer positioning avoids covering exercise controls. Empty/loading/error states, focus states and accessible labels are included.

Validation passed: npm run check, including 52 vocabulary tests (26 new workspace/practice tests), template rendering and the existing website checks. git diff --check passed. Local browser QA used real route handlers with isolated in-memory dictionary/student fixtures, not production data. Widths 320, 390, 768 and 1440 were checked without horizontal overflow. Manual flows covered custom goals and reload, partial blocks, flashcard hiding and reset, mini dictionary and save/close, correct and wrong quiz/writing answers, previous question navigation, daily completion and next-ten continuation (5 of 15 retained).

## Practical limits

Production deployment and Hostinger were not opened or verified. Preview counts and profiles are test data. Reload starts a fresh exercise round while persisted student progress remains. Quiz currently tests meaning recognition. Audio depends on available dictionary audio or device voices. Deferred curriculum review remains separate from this UI release.

The follow-up Homework consistency pass caps both the vocabulary portal shell and Reading workspace/header at the shared 1120px site width. Reading now uses the same standard portal header controls as Homework and SVG navigation icons; both pages continue to use the shared saved light/dark theme.

The study workspace now follows the same three-column exercise frame as Homework: one internal list, a wider exercise column, and an on-page progress panel. The global profile sidebar remains on the vocabulary dashboard and is omitted while studying to preserve reading space. Reading uses the same progress/navigation rail for questions.

Learning uses Previous / Help / Next without self-ratings or the mini dictionary. Next records a neutral studied event; it does not award mastery or correct answers. Migration 44 adds this event to the existing activity enum through the standard automatic schema migration runner. Flashcards use a fully clickable native button with the German word on the front and the English meaning on the back; audio remains a separate control; flashcards use neutral study progress without self-ratings. Quiz and writing share one responsive action row with no duplicate Next or replay buttons. Reading and vocabulary inherit Homework's theme tokens, including automatic system dark mode.

Lesen now reuses Homework’s actual exercise frame, accessible sibling lesson list, return pills, section typography and column breakpoints. Its dashboard uses the same progress band, course/level filters and grouped assignment rows. Vocabulary follows those heading dimensions and panel measures. All three material sections share themed, rounded scrollbars; only the lists scroll inside the fixed side panels.

The vocabulary interaction pass replaces the per-word reset with mode-specific Help, fills saved stars across the dashboard and study view, and adds visible hover/press/focus states. Flashcards flip in place with a two-sided 3D transition (disabled for reduced motion), without self-ratings. Next records neutral study. Quiz and writing show server-graded answers in green/red without disabled-state fading. Quiz has no separate Skip button: Next can move past an unchecked question using the existing assisted-answer path, without awarding knowledge. No SQL change is required.

Student pages now share one collapsible portal menu. Homework, Lesen and vocabulary workspaces share a mobile lesson-list disclosure and return buttons that stay below the site header while scrolling. Expanded lists scroll within a bounded height. The public account dropdown stays within the phone viewport, including narrow screens. Desktop sidebars and student access checks are retained.
