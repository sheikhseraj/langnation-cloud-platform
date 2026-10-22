# LangNation Lesen UI – Compact Layout Correction for Codex

## Context
The current implementation is functionally correct, but the visual redesign misunderstood the target reference. It mainly enlarged the Lesen workspace to fill the available desktop width. That is **not** the desired result.

Use the supplied screenshots as the visual source of truth:
- Current implementation: the wide/full-screen version with the large reading area, large Dictionary card, and wide action toolbar.
- Target reference: the compact LangNation mockup with a narrower centered learning workspace, small selection toolbar, and compact Dictionary popover anchored beside the selected word.

## Critical instruction
**Do not redesign the whole portal again. Do not make the page wider. Do not increase global font sizes. Do not replace the existing portal shell.**

Only refine the Lesen workspace proportions and floating Dictionary/selection UI.

---

## 1. Preserve the existing portal shell
Keep exactly as-is unless a tiny spacing adjustment is required:
- current LangNation header/logo/account controls
- current top learning navigation
- current left Lessons/level sidebar
- authentication/account behavior
- routes, data, progress, Dictionary integration, exercise logic
- dark mode

Do not touch unrelated Student Portal pages.

---

## 2. Constrain the Lesen workspace instead of stretching it
The current page stretches too much on large monitors.

Desktop target:
- Main Lesen content wrapper: `max-width: 1120px` (acceptable range 1080–1180px)
- Center it inside the available area after the sidebar.
- `width: calc(100% - normal gutters)`
- Desktop horizontal gutters: 28–40px
- Do **not** let the reading card grow endlessly on 1440p/4K screens.
- The reading card and comprehension card should use the same content width.

Large desktop behavior:
- once the max width is reached, add empty space around the workspace rather than stretching text lines.

Reading text should have a comfortable measure:
- ideal text column around 720–820px when no popover overlaps it
- avoid very long 1200px+ lines

---

## 3. Typography should be compact like the target reference
Do not solve the redesign by increasing font sizes.

Suggested desktop sizes:
- page title: 38–44px
- reading-card title: 28–34px
- reading text: 17–19px
- reading line-height: 1.55–1.7
- breadcrumb/meta: 12–14px
- question title: 18–21px
- option text: 14–16px

Keep the existing LangNation fonts and design tokens where available.

---

## 4. Selection toolbar must be a MINI toolbar
The current toolbar is too large and visually dominant.

Target behavior:
- anchored 6–10px above/below the selected word/phrase
- `width: auto`
- `max-width: 340px`
- height approximately 36–40px
- labels around 12–13px
- icon size around 14–16px
- compact horizontal padding (8–10px per action)
- subtle shadow and thin navy/gold border
- small corner radius consistent with the portal

Actions:
- Meaning
- Translate
- Listen
- Save
- Copy (optional / keep if already implemented)

Do not render these as large buttons.
Do not center this toolbar on the page.
Do not make the toolbar affect document flow.

Use collision/viewport handling so it flips or shifts near an edge.

---

## 5. Dictionary must be a compact anchored popover, not a modal/card dominating the page
The Dictionary is the biggest mismatch right now.

### Desktop target dimensions
- width: about `320px`
- preferred range: `310–340px`
- hard maximum: `360px`
- max-height: approximately `360–420px`
- internal scrolling only if expanded content truly requires it
- it must float over the lesson; it must not increase the reading card width or page height

### Positioning
Anchor it to the selected word/toolbar, preferably to the right when space exists.
If there is not enough space:
- flip left
- or place below/above

Never let it leave the viewport.
Do not position it in the center of the screen.

Use an existing popover/floating utility if the project has one. Otherwise use a robust anchored positioning approach based on the selection/client rect.

### Visual structure
Keep it visually close to the real LangNation Dictionary, but mini:

`LangNation Dictionary                                  ×`

`die Kleidung   🔊`
`clothing`

`Plural: die Kleidungen`
`Synonyme: das Kleid`

thin divider

`Die Kleidung muss zur Jahreszeit passen.`
`The clothing should match the season.`

`[Listen] [Save]`

`Open full Dictionary ↗`

Optional collapsed rows:
- `Examples & related words ▸`
- `Other meanings (2) ▸`

### Dictionary typography
Suggested:
- mini header: 12–13px / semibold
- headword: 22–26px
- primary meaning: 14–15px
- meta/forms: 12–13px
- example: 13–14px
- translation: 12–13px
- action buttons: 12–13px, 32–36px height

### Important content rule
Show the best matching entry first.
Do not show several complete Dictionary entries stacked vertically by default.
Alternative meanings/results must be collapsed.

---

## 6. Selection highlight
Selected text should use a small LangNation gold highlight similar to the target reference.
It must not create a big rectangular selection block.

Maintain native selection/accessibility as much as possible.

---

## 7. Reading card proportions
Keep a generous but compact reading card.

Suggested:
- padding: 28–36px desktop
- radius: existing LangNation radius
- thin border
- subtle/no heavy shadow

Do not increase its dimensions when the Dictionary opens.
The Dictionary is an overlay/popover.

---

## 8. Comprehension / Textverständnis card
Keep it directly below the reading card and visually aligned with it.

Do not stretch or inflate it unnecessarily.

For a normal MCQ:
- header row: icon/title + `2 / 5` + previous/next
- question text
- answers in 2 columns on desktop if space allows
- answer option height roughly 46–54px
- compact `Antwort prüfen` and `Hinweis` buttons
- compact footer navigation

On mobile, switch to one-column answers.

The question card should feel like the compact target mockup, not a huge form.

---

## 9. Responsive rules
### Desktop
- constrained centered workspace
- mini toolbar
- ~320px Dictionary popover beside selected word

### Tablet
- keep constrained layout
- Dictionary can be 300–330px and flip position

### Mobile
Do not attempt a tiny side popover if it becomes unusable.
Use a compact bottom sheet / anchored full-width card with 12–16px side margins.
It must still look like the mini Dictionary, not a full-screen modal.

---

## 10. Dark mode
Preserve the currently implemented dark mode.
Apply the same compact sizing/proportions in dark mode.
Do not create separate geometry for dark mode.
Only colors/borders/shadows should differ.

---

## 11. Do not change functionality
Keep working:
- Meaning
- Translate
- Listen
- Save word
- Copy
- Open full Dictionary
- multiple meanings
- exercises
- progress
- previous/next question
- previous/next reading
- existing API integration
- existing dark-mode toggle

This task is primarily **visual/layout correction**, not feature replacement.

---

## 12. Implementation scope
Prefer changing only the Lesen-related templates/styles/scripts that are required.
Do not rewrite the architecture.
Do not duplicate Dictionary or Homework logic.

Before editing, identify which existing selectors/components currently control:
- main Lesen max width
- reading text font/line length
- selection toolbar dimensions
- Dictionary popover dimensions/position
- question card dimensions

Then adjust those existing components rather than adding a parallel implementation.

---

## 13. Acceptance criteria
The work is accepted only when all of these are true:

1. On a wide desktop, Lesen no longer expands across almost the whole available screen.
2. Reading text has a comfortable line length and centered constrained workspace.
3. Selection toolbar looks like a small floating contextual toolbar.
4. Dictionary is visibly compact (~320px), not a large modal/card.
5. Dictionary opens beside the selected word when possible.
6. Opening the Dictionary does not change page/card width or reflow the lesson.
7. Only one primary Dictionary entry is expanded by default.
8. Comprehension card is compact and aligned with the reading card.
9. Desktop, tablet, mobile all pass.
10. Existing functionality and progress still work.
11. Dark mode remains correct.

---

## 14. Verification
After implementation:
- run existing browser/reading checks
- lint/type-check/build if available
- test at approximately 1920×1080
- test around 1366×768
- test tablet
- test mobile

Capture screenshots for:
1. desktop Lesen without Dictionary
2. desktop selection toolbar
3. desktop Dictionary popover
4. desktop question card
5. dark mode Dictionary
6. mobile Dictionary

Do not push yet. Show me the screenshots first so I can approve the visual proportions.
