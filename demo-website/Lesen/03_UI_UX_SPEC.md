# UI / UX Specification
## LangNation Lesen + Dictionary Lookup

## 1. Design direction

The reading module belongs to the Student Portal, so its page shell, navigation, spacing and standard controls should reuse the main website design system.

The **vocabulary result card** should visually echo the current LangNation Dictionary UI:
- warm ivory/cream background;
- dark navy typography and outlines;
- restrained gold accents;
- classic serif treatment for the primary German headword where compatible with existing fonts;
- compact uppercase/micro-label styling for sections such as Meaning, Word Family and Examples;
- thin bordered cards with soft corner radius;
- minimal, academic, premium appearance.

Do not copy the entire Dictionary page into the portal. Adapt its visual language to a compact learning component.

---

## 2. Reading page wireframe

```text
┌──────────────────────────────────────────────────────────┐
│ ← Lesen     A1 · Lesen 01                   2 / 8 lessons │
├──────────────────────────────────────────────────────────┤
│ Die Farben                                               │
│ Lese den Text und beantworte danach die Aufgaben.        │
│                                                          │
│ [optional lesson image]                                  │
│                                                          │
│ Farben machen das Leben bunt. Der Regenbogen besteht ... │
│ Obst und Gemüse ist oft sehr farbig ...                  │
│                                                          │
│         selected: [ Regenbogen ]                         │
│             ┌────────────────────────┐                   │
│             │ Meaning Translate 🔊 ☆ │                   │
│             └────────────────────────┘                   │
│                                                          │
│ ──────────────────────────────────────────────────────── │
│ Aufgabe 1 von 5                                          │
│ Welche Dinge sind nicht rot?                             │
│ ○ Bananen                                                │
│ ○ Tomaten                                                │
│ ○ Erdbeeren                                              │
│ ○ Rosen                                                  │
│ [Antwort prüfen]                                         │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Contextual selection toolbar

Desktop compact toolbar:

```text
┌──────────────────────────────────────────┐
│ Meaning  │ Translate │ 🔊 │ ☆ Save       │
└──────────────────────────────────────────┘
```

Rules:
- position close to the current selection;
- flip above/below depending on viewport room;
- never render offscreen;
- close when selection collapses or user clicks outside;
- preserve selection while opening the result panel;
- show text labels for primary actions; icons alone only when universally clear and accessible.

If no Dictionary result has loaded, `Listen` can be disabled until audio is known.

---

## 4. Result card

### Compact result

```text
┌────────────────────────────────────────────────────┐
│ DE → EN                                ☆     🔊     │
│                                                    │
│ das Bewerbungsgespräch                            │
│ job interview                                      │
│                                                    │
│ EXAMPLE                                            │
│ Ich habe ein Bewerbungsgespräch nächste Woche.    │
│                                                    │
│ [Details] [Save word] [Open full Dictionary ↗]    │
└────────────────────────────────────────────────────┘
```

### Expanded details

Show sections only if the real Dictionary response includes them:
- word family / noun forms;
- conjugation/declension;
- synonyms;
- meanings;
- examples;
- pronunciation.

Use progressive disclosure. The popup should not become a full-page Dictionary replica.

---

## 5. Mobile result

Prefer a bottom sheet:

```text
┌────────────────────────────────┐
│        drag handle             │
│ das Bewerbungsgespräch   🔊 ☆  │
│ job interview                  │
│                                │
│ Example                        │
│ Ich habe ...                   │
│                                │
│ Word family                    │
│ ...                            │
│                                │
│ Open full Dictionary ↗         │
└────────────────────────────────┘
```

The reading position should remain intact after closing the sheet.

---

## 6. Exercise interaction

### Unanswered
Neutral borders, clear primary action.

### Correct
- check icon + text `Richtig!`;
- do not rely on green alone;
- optionally show a short explanation.

### Incorrect
- text `Noch nicht richtig.`;
- show Hint and Retry;
- do not instantly reveal the answer unless product rules say so.

### Hint
Display progressively if the exercise model supports multiple hints.

### Reveal source
`Im Text anzeigen` scrolls/focuses to and highlights the configured supporting range. It should not permanently alter stored lesson HTML.

---

## 7. Progress UI

At lesson top or near exercises:

```text
Lesefortschritt   ██████░░░░  60%
3 / 5 Aufgaben
```

Do not over-gamify. Keep the style sober and educational.

---

## 8. Meine Vokabeln

Suggested card/list:

```text
Bewerbungsgespräch
job interview · das · Pl. Bewerbungsgespräche
From: B1 · Lesen 05
[Listen] [Open Dictionary] [Remove]
```

Future actions may include flashcards/revision, but are not required for MVP.

---

## 9. Empty/error states

### No Dictionary result

```text
Kein exakter Eintrag gefunden.
Search the full LangNation Dictionary for “...” ↗
```

### Upstream error

```text
Das Wörterbuch ist gerade nicht erreichbar.
Du kannst mit der Leseübung weiterlernen.
[Erneut versuchen]
```

### No reading lessons
Use the existing portal empty-state styling and explain whether lessons are not yet published or not part of the student's course.

---

## 10. Accessibility details

- selected word action toolbar is reachable by keyboard;
- result popup receives focus appropriately but does not trap focus unnecessarily unless rendered as modal;
- bottom sheet/modal uses focus trap and returns focus on close;
- icons have accessible names;
- audio button reports playing/paused where relevant;
- `aria-live` for exercise feedback;
- native text selection should remain available;
- all contrast must meet the project's accessibility target.
