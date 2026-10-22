# LangNation Homework & Self-Learning Engine
## Kapitel 09 — Negation

> Complete implementation specification. Speaking and Writing are intentionally excluded from this homework flow.

## Master pattern
- Keep the existing LangNation layout/design.
- 1–2 solved examples before every Übung/Aufgabe; examples do not count.
- Two progressive hints; answer reveal is separate.
- Deterministic automatic checking; no teacher review for this chapter.
- Immediate educational feedback, retry, congratulations, and Fehler wiederholen.
- Progress: 🟢 richtig · 🟡 mit Hinweis · 🔴 verbessern · ⚪ offen.
- Short right sidebar labels: Kapitel 09 / Übung 1 … / Lesetext.

## Exercises
### Übung 1 – nicht oder kein?
**Type:** `fill_blank`  
**Objective:** nicht vs. kein/keine/keinen erkennen und die passende Form einsetzen.  
**Instruction:** Ergänze die richtige Negation in passender Form.

**Examples**
- `Ich habe ___ Fahrrad.` → **Ich habe kein Fahrrad.** — Nomen: Fahrrad → kein.
- `Das Fahrrad ist ___ teuer.` → **Das Fahrrad ist nicht teuer.** — Adjektiv: teuer → nicht.

| ID | Prompt | Accepted | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 1 | Ich habe ___ Auto. | kein | Schau auf das Wort nach der Lücke: Ist es ein Nomen? | Auto ist Neutrum und steht hier im Akkusativ. | Richtig: kein Auto. |
| 2 | Das Auto ist ___ neu. | nicht | Was wird verneint: ein Nomen oder die Eigenschaft „neu“? | Adjektive werden normalerweise mit nicht verneint. | Richtig: nicht neu. |
| 3 | Wir trinken ___ Kaffee. | keinen | Kaffee ist ein Nomen. | Kaffee ist maskulin und steht im Akkusativ. | Richtig: keinen Kaffee. |
| 4 | Sie kommt heute ___. | nicht | Hier wird die Handlung „kommen“ verneint. | Für die Verneinung der Handlung verwendest du nicht. | Richtig: Sie kommt heute nicht. |
| 5 | Das ist ___ mein Buch. | nicht | Vor „mein Buch“ steht schon ein Possessivartikel. | Mit Possessivartikeln verwendest du hier nicht. | Richtig: Das ist nicht mein Buch. |
| 6 | Er hat ___ Zeit. | keine | Zeit ist ein Nomen. | Zeit ist feminin. | Richtig: keine Zeit. |
| 7 | Ich kenne dort ___ Mann. | keinen | Mann ist ein Nomen. | Mann ist maskulin und steht im Akkusativ. | Richtig: keinen Mann. Diese Formulierung wurde gegenüber der Vorlage bewusst eindeutig gemacht. |
| 8 | Wir fahren ___ mit dem Auto. | nicht | Hier wird die Handlung bzw. Art des Fahrens verneint. | Setze nicht vor die Präpositionalgruppe. | Richtig: Wir fahren nicht mit dem Auto. |

### Übung 2 – kein deklinieren
**Type:** `fill_blank`  
**Objective:** kein nach Kasus, Genus und Numerus korrekt deklinieren.  
**Instruction:** Setze die richtige Form von kein ein.

**Examples**
- `Ich sehe ___ Hund. (Akk., m.)` → **Ich sehe keinen Hund.** — Akkusativ + maskulin → keinen.
- `Sie spricht mit ___ Freundin. (Dat., f.)` → **Sie spricht mit keiner Freundin.** — Dativ + feminin → keiner.

| ID | Prompt | Accepted | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 9 | Ich habe ___ Termin. (Akk., m.) | keinen | Bestimme zuerst Kasus und Genus. | Akkusativ + maskulin hat die Endung -en. | Richtig: keinen Termin. |
| 10 | Sie hat ___ Tasche. (Akk., f.) | keine | Tasche ist feminin. | Akkusativ feminin → keine. | Richtig: keine Tasche. |
| 11 | Wir helfen ___ Kunden. (Dat., m.) | keinem | Das Verb helfen verlangt Dativ. | Dativ maskulin → keinem. | Richtig: keinem Kunden. |
| 12 | Er spricht mit ___ Kolleginnen. (Dat., Pl.) | keinen | Die Präposition mit verlangt Dativ. | Dativ Plural → keinen; das Nomen trägt hier bereits die Pluralform. | Richtig: mit keinen Kolleginnen. |
| 13 | Das ist ___ Problem. (Nom., n.) | kein | Problem ist Neutrum. | Nominativ Neutrum → kein. | Richtig: kein Problem. |
| 14 | Wegen ___ Fehlers wurde der Termin verschoben. (Gen., m.; formell) | keines | Wegen kann formell mit Genitiv stehen. | Genitiv maskulin → keines. | Richtig: wegen keines Fehlers. |

### Übung 3 – Stellung von nicht
**Type:** `insert_word`  
**Objective:** nicht abhängig vom verneinten Satzteil an die natürliche Position setzen.  
**Instruction:** Setze „nicht“ an die passende Stelle. Die Information in Klammern soll verneint werden.

**Examples**
- `Ich fahre heute mit dem Bus. (mit dem Bus)` → **Ich fahre heute nicht mit dem Bus.** — nicht steht direkt vor dem verneinten Satzteil.
- `Das Zimmer ist sehr groß. (groß)` → **Das Zimmer ist nicht sehr groß.** — Bei Adjektiven steht nicht vor der Adjektivgruppe.

| ID | Prompt | Accepted | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 15 | Ich fahre morgen mit dem Auto. (mit dem Auto) | Ich fahre morgen nicht mit dem Auto. | Welcher Satzteil soll verneint werden? | Setze nicht direkt vor „mit dem Auto“. | Richtig: Ich fahre morgen nicht mit dem Auto. |
| 16 | Wir treffen uns am Montag. (am Montag) | Wir treffen uns nicht am Montag. | Der Zeitpunkt soll verneint werden. | Setze nicht direkt vor „am Montag“. | Richtig: Wir treffen uns nicht am Montag. |
| 17 | Anna kommt heute. (Anna – Kontrast: nicht Anna, sondern jemand anderes) | Nicht Anna kommt heute. | Hier wird ausdrücklich die Person kontrastiert. | Bei Fokusnegation kann nicht direkt vor dem Namen stehen. | Richtig als Kontrastfokus: Nicht Anna kommt heute. Die UI soll den Zusatz „sondern jemand anderes“ als Erklärung anzeigen. |
| 18 | Das Essen ist sehr teuer. (teuer) | Das Essen ist nicht sehr teuer. | Die Eigenschaft wird verneint. | Setze nicht vor die Adjektivgruppe „sehr teuer“. | Richtig: Das Essen ist nicht sehr teuer. |
| 19 | Er kann morgen kommen. (kommen / ganze Handlung) | Er kann morgen nicht kommen. | Bei Modalverb + Infinitiv steht nicht oft vor dem Infinitiv. | Setze nicht vor „kommen“. | Richtig: Er kann morgen nicht kommen. |

### Übung 4 – nichts, niemand, nie oder nirgendwo
**Type:** `fill_blank_adaptive`  
**Objective:** Negativpronomen und Adverbien nach Bedeutung unterscheiden.  
**Instruction:** Ergänze das passende Wort.

**Examples**
- `Ich esse ___.` → **Ich esse nichts.** — Sache/Objekt → nichts.
- `___ wartet vor der Tür.` → **Niemand wartet vor der Tür.** — Person → niemand.

| ID | Prompt | Accepted | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 20 | Ich sehe ___. | nichts | Geht es um eine Person, Sache, Zeit oder einen Ort? | Hier geht es um eine Sache/etwas. | Richtig: nichts. |
| 21 | ___ ist im Büro. | niemand | Gesucht ist eine Person. | Am Satzanfang wird das Wort großgeschrieben. | Richtig: Niemand. |
| 22 | Ich rauche ___. | nie | Gesucht ist ein Ausdruck für „zu keiner Zeit“. | Zeit/Häufigkeit → nie. | Richtig: nie. |
| 23 | Ich finde meinen Schlüssel ___. | nirgendwo | Gesucht ist ein Ort. | Ort → nirgendwo. | Richtig: nirgendwo. |
| 24 | Ich kenne hier ___. | niemanden | Gesucht ist eine Person im Akkusativ. | niemand bekommt hier die Akkusativendung -en. | Richtig: niemanden. |
| 25 | Es gibt ___ Neues. | nichts | Gesucht ist „keine Sache / nichts“. | Nach nichts kann ein substantiviertes Adjektiv stehen: nichts Neues. | Richtig: nichts Neues. |

### Übung 5 – noch nicht / nicht mehr / noch nie
**Type:** `phrase_fill`  
**Objective:** zeitliche Negationsausdrücke nach Bedeutung unterscheiden.  
**Instruction:** Ergänze den passenden Ausdruck.

**Examples**
- `Ich habe die Hausaufgaben ___ gemacht; ich mache sie später.` → **noch nicht** — Bis jetzt nicht, aber später wahrscheinlich → noch nicht.
- `Früher spielte er Fußball; heute spielt er ___.` → **nicht mehr** — Früher ja, jetzt nein → nicht mehr.

| ID | Prompt | Accepted | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 26 | Ich habe ___ gegessen; ich esse später. | noch nicht | Ist die Handlung bis jetzt nicht passiert, kann aber später passieren? | Dann verwendest du noch nicht. | Richtig: noch nicht. |
| 27 | Früher wohnte ich hier, aber jetzt wohne ich hier ___. | nicht mehr | Früher ja, jetzt nein. | Dieser Wechsel wird mit nicht mehr ausgedrückt. | Richtig: nicht mehr. |
| 28 | Ich war ___ in Österreich. | noch nie / nie | Geht es um eine Erfahrung bis zum heutigen Zeitpunkt? | noch nie betont „bis jetzt“. Auch nie ist grammatisch korrekt. | Bevorzugt: noch nie. Akzeptiert wird auch: nie. |
| 29 | Der Kurs ist ___ zu Ende. | noch nicht | Der Kurs läuft im Moment weiter. | Bis jetzt nicht beendet → noch nicht. | Richtig: noch nicht. |
| 30 | Wir haben ___ Kaffee ___; alles ist aufgebraucht. | keinen\|mehr | Hier brauchst du zwei Teile. | Vor Kaffee steht die Form von kein; nach Kaffee steht mehr. | Richtig: keinen Kaffee mehr. |

### Übung 6 – weder … noch / sondern
**Type:** `sentence_transform_adaptive`  
**Objective:** zwei Aussagen mit weder … noch oder sondern korrekt verbinden.  
**Instruction:** Verbinde die Aussagen. Schreibe zuerst selbst; bei Schwierigkeiten erhältst du schrittweise Hilfe.

**Examples**
- `Ich esse kein Fleisch. Ich esse keinen Fisch.` → **Ich esse weder Fleisch noch Fisch.** — Zwei negative Alternativen → weder … noch.
- `Sie fährt nicht heute. Sie fährt morgen.` → **Sie fährt nicht heute, sondern morgen.** — Korrektur/Kontrast → sondern.

| ID | Prompt | Accepted | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 31 | Ich trinke keinen Kaffee. Ich trinke keinen Tee. | Ich trinke weder Kaffee noch Tee. / Weder Kaffee noch Tee trinke ich. | Sind beide Möglichkeiten negativ? | Verwende weder vor Kaffee und noch vor Tee. | Richtig: Ich trinke weder Kaffee noch Tee. |
| 32 | Er kommt nicht heute. Er kommt morgen. | Er kommt nicht heute, sondern morgen. / Er kommt heute nicht, sondern morgen. | Die zweite Aussage korrigiert die erste. | Verbinde mit sondern. | Richtig: Er kommt heute nicht, sondern morgen. |
| 33 | Das ist kein Hotel. Das ist ein Büro. | Das ist kein Hotel, sondern ein Büro. | Die zweite Aussage stellt richtig, was es ist. | Nach der negativen Aussage passt sondern. | Richtig: Das ist kein Hotel, sondern ein Büro. |
| 34 | Sie spricht nicht Französisch. Sie spricht nicht Spanisch. | Sie spricht weder Französisch noch Spanisch. / Weder Französisch noch Spanisch spricht sie. | Beide Sprachen werden ausgeschlossen. | Verwende weder … noch. | Richtig: Sie spricht weder Französisch noch Spanisch. |

### Übung 7 – Fehler korrigieren
**Type:** `sentence_correction`  
**Objective:** typische Fehler bei der Negation erkennen und selbst korrigieren.  
**Instruction:** Korrigiere den Satz. Bearbeite möglichst nur die Stelle, die falsch ist.

**Examples**
- `Ich habe nicht Auto.` → **Ich habe kein Auto.** — Nomen ohne bestimmten Artikel → kein.
- `Das Wetter ist kein schön.` → **Das Wetter ist nicht schön.** — Adjektiv → nicht.

| ID | Prompt | Accepted | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 35 | Ich habe nicht Geld. | Ich habe kein Geld. | Was wird verneint: ein Nomen oder eine Eigenschaft? | Geld ist ein Nomen. | Richtig: Ich habe kein Geld. |
| 36 | Niemand kommt nicht. | Niemand kommt. | Achte auf doppelte Negation. | Niemand enthält die Negation schon. | Richtig: Niemand kommt. |
| 37 | Das ist kein interessant. | Das ist nicht interessant. | interessant ist ein Adjektiv. | Adjektiv → nicht. | Richtig: Das ist nicht interessant. |
| 38 | Ich war nicht nie in Berlin. | Ich war noch nie in Berlin. / Ich war nie in Berlin. | Hier stehen zwei Negationen unnötig zusammen. | Verwende nie oder – für „bis jetzt“ – noch nie. | Bevorzugt: Ich war noch nie in Berlin. Akzeptiert: Ich war nie in Berlin. |
| 39 | Wir haben nicht Milch mehr. | Wir haben keine Milch mehr. | Milch ist ein Nomen. | Feminin: keine; mehr steht nach dem Nomen. | Richtig: Wir haben keine Milch mehr. |

### Lesetext — Kein perfekter Montag

Heute läuft bei Leon nicht alles gut. Am Morgen hat er keine Zeit für Frühstück. Der Bus kommt nicht pünktlich, deshalb erreicht er die Arbeit zu spät. Im Büro findet er niemanden an seinem Platz, denn alle sind in einer Besprechung. Leon hat noch nicht auf seine E-Mails geantwortet und es gibt keinen Kaffee mehr. Mittags möchte er weder Pizza noch Pasta essen. Am Abend ist er aber nicht mehr gestresst: Er geht nicht ins Fitnessstudio, sondern direkt nach Hause und macht einfach nichts.

#### Aufgabe 1 – Markieren
- Type: `text_highlight`
- Instruction: Markiere alle Negations- und Kontrastausdrücke im Text.
- Beispiel: „Der Bus ist nicht pünktlich.“ → Markiere „nicht“.
- Accepted: nicht / keine / nicht / niemanden / noch nicht / keinen … mehr / weder … noch / nicht mehr / nicht / sondern / nichts
- Hint 1: Suche nach nicht, Formen von kein, Negativpronomen und Konnektoren.
- Hint 2: Es gibt 11 zu markierende Ausdrücke, wenn mehrteilige Ausdrücke als Einheit gezählt werden.
- Feedback: Die Markierungen werden direkt im Text geprüft; mehrteilige Ausdrücke werden als zusammengehörige Gruppe gespeichert.

#### Aufgabe 2 – Sortieren
- Type: `categorize`
- Instruction: Ordne die markierten Ausdrücke der passenden Kategorie zu.
- Beispiel: „niemanden“ → Negativpronomen.
  - **nicht:** nicht (nicht alles), nicht (nicht pünktlich), nicht (nicht ins Fitnessstudio)
  - **kein:** keine, keinen … mehr
  - **Negativpronomen:** niemanden, nichts
  - **Zeit-/Verlaufs-Ausdruck:** noch nicht, nicht mehr
  - **Konnektor:** weder … noch, sondern
- Hint 1: Frage dich: Nomen-Verneinung, Person/Sache, Zeitverlauf oder Verbindung/Kontrast?
- Hint 2: weder … noch und sondern gehören zu den Konnektoren.
- Feedback: Nach dem Sortieren zeigt die UI pro Kategorie eine kurze Regel.

#### Aufgabe 3 – Textverständnis
- Type: `short_answer`
- Instruction: Was hat Leon noch nicht gemacht? Antworte in einem ganzen Satz.
- Beispiel für das Antwortformat: „Er hat noch nicht gefrühstückt.“
- Accepted: Leon hat noch nicht auf seine E-Mails geantwortet. / Er hat noch nicht auf seine E-Mails geantwortet. / Leon hat noch nicht auf die E-Mails geantwortet. / Er hat noch nicht auf die E-Mails geantwortet.
- Hint 1: Suche im Text nach „noch nicht“.
- Hint 2: Die Stelle steht im Satz mit den E-Mails.
- Feedback: Inhalt korrekt, aber nur ein Fragment? Dann gelb anzeigen: „Richtig verstanden – bitte antworte noch in einem ganzen Satz.“

#### Aufgabe 4 – Textverständnis
- Type: `short_answer`
- Instruction: Was gibt es nicht mehr? Antworte in einem ganzen Satz.
- Beispiel für das Antwortformat: „Es gibt kein Wasser mehr.“
- Accepted: Es gibt keinen Kaffee mehr. / Im Büro gibt es keinen Kaffee mehr.
- Hint 1: Suche nach der Struktur „kein … mehr“.
- Hint 2: Es geht um ein Getränk.
- Feedback: Einwortantwort „Kaffee“ ist inhaltlich erkannt, aber noch nicht vollständig; die UI fordert einen ganzen Satz.

#### Aufgabe 5 – Sätze umformen
- Type: `sentence_transform`
- Instruction: Verneine die vorgegebenen positiven Sätze mit dem angegebenen Ausdruck.
- Beispiel: „Der Bus ist pünktlich.“ + nicht → „Der Bus ist nicht pünktlich.“
  - 40. Leon ist am Abend gestresst. Verwende: nicht mehr → Leon ist am Abend nicht mehr gestresst.
  - 41. Leon geht am Abend ins Fitnessstudio. Verwende: nicht → Leon geht am Abend nicht ins Fitnessstudio.
- Hint 1: Setze den vorgegebenen Negationsausdruck direkt vor den Teil, den du verneinen möchtest.
- Hint 2: Achte besonders auf die Stellung von nicht bzw. nicht mehr.
- Feedback: Diese geführte Version ersetzt die sehr offene Originalaufgabe und kann vollständig automatisch geprüft werden.

## Claude Code prompt

```text
You are working inside the existing LangNation language-school website repository.

GOAL
Upgrade the existing student Homework feature into a reusable self-learning homework engine and implement Kapitel 09 — Negation from the attached specification. The goal is maximum learning output from the student with minimum teacher interaction.

VERY IMPORTANT
1. First inspect the existing repository, current Homework pages/components, database/schema/models, API routes/server actions, auth/enrollment logic and styling. Do not assume a framework if the repository already tells you what is used.
2. Do NOT rebuild the website or replace the existing LangNation design. Preserve the current dark navy/gold visual identity, authentication, course enrollment, navigation and existing routes.
3. Make the solution generic/data-driven. Kapitel 09 must be content/configuration for reusable components, not a set of one-off hard-coded pages.
4. Speaking and Writing are out of scope for this homework flow. Do not add audio submission, teacher writing review or manual-marking queues here.
5. Do not use an LLM/API to judge these controlled grammar answers. Use deterministic evaluation based on accepted answers, insertion positions, categories and normalization.
6. Reuse/extend existing database structures where sensible. Do not create duplicate homework systems.
7. Before coding, make a concise implementation plan based on the real repository. Then implement it completely.

STUDENT UX
Keep the current overall three-column layout on desktop:
- left: Homework/course navigation
- center: current exercise
- right: compact progress/navigation
On mobile, collapse sidebars sensibly.

Right sidebar must use short labels:
Kapitel 09
✓ Übung 1
✓ Übung 2
● Übung 3
! Übung 4
○ Übung 5
○ Übung 6
○ Übung 7
○ Lesetext

Use tooltip/title/aria-label for the full exercise name so text never clips.

Top center:
Kapitel 09 — Negation
Übung X von 8

COMMON EXERCISE FLOW
Every Übung/Aufgabe must support:
- short instruction
- 1–2 solved examples shown in a compact Beispiel card
- student tasks
- “Hinweis” button
- “Noch ein Hinweis” for level 2
- “Prüfen”
- immediate explanatory feedback
- retry
- “Lösung zeigen” only after sufficient effort (recommended: 2 failed attempts or both hints)
- persisted progress
- completion/congratulation card after the Übung

Examples never count as tasks/progress.

PROGRESS STATES
Use four student-facing states:
- green = richtig: solved without hints/solution reveal
- yellow = mit Hinweis: correct after one or more hints
- red = verbessern: unresolved or solution was revealed
- gray = offen: not attempted

Do not hard-code “23 Aufgaben”. Calculate all totals dynamically from countable questions.

Store useful analytics such as attempts and firstTryCorrect internally, but do not make the student UI punitive.

HINT RULES
- Hint 1 = concept clue, never the exact answer.
- Hint 2 = targeted clue.
- “Lösung zeigen” is separate.
- If solution is shown, require the student to reproduce the correct answer once, but keep the item red until review mode.
- In “Fehler wiederholen”, a correct answer without hints can upgrade red -> green; with hint red -> yellow.

ANSWER NORMALIZATION
At minimum:
- Unicode NFC normalize
- trim
- collapse repeated spaces
- ignore optional final . ! ? for controlled sentence answers
Do not silently accept all spelling errors.
German capitalization can be treated as a soft orthography warning where the grammar target is otherwise correct.
Keep umlauts/spelling meaningful.
Support multiple accepted answers from the supplied chapter data.

REUSABLE QUESTION TYPES NEEDED
- fill_blank
- fill_blank_adaptive
- phrase_fill / linked multi-blank
- insert_word (for positioning “nicht”; avoid a large textarea)
- sentence_transform_adaptive
- sentence_correction
- text_highlight
- categorize
- short_answer
- sentence_transform

SPECIAL UI BEHAVIOR
Übung 3:
Render sentence segments/tokens and let the student insert or drag “nicht” to the correct position. Check the insertion position and show the final complete sentence.

Übung 4:
First attempt can be free input. After a wrong attempt / deeper hint, optionally reveal the small word bank (nichts, niemand, nie, nirgendwo).

Übung 5 question “Wir haben ___ Kaffee ___”:
Use two linked blanks but count as one task.

Übung 6:
Attempt 1 = free sentence.
Hint 1 = concept/connector clue.
Hint 2 = sentence skeleton.
After two wrong attempts, offer a guided builder rather than sending anything to a teacher.

Übung 7:
Use an editable incorrect sentence. Prefer showing the changed/corrected part after evaluation.

LESETEXT
Keep the current reading image/text card.
Implement:
1. clickable/highlightable target expressions
2. drag/drop or click-to-categorize
3. short answers with complete-sentence expectation
4. two guided sentence transformations
No teacher marking.

CONGRATULATION/MOTIVATION
After each Übung show a compact completion card:
- independent perfect: “🌟 Ausgezeichnet! Alle Aufgaben richtig – ohne Hinweis.”
- with hints: “🎉 Sehr gut! Übung geschafft.”
- red items remain: “👍 Übung abgeschlossen. X Aufgaben warten noch auf Wiederholung.”
Buttons: “Weiter” and, if relevant, “Aufgaben wiederholen”.

After chapter:
“🏆 Kapitel 09 abgeschlossen! Negation geschafft.”
Show dynamic counts:
🟢 richtig
🟡 mit Hinweis
🔴 verbessern
⚪ offen
If yellow/red items exist, show “Fehler wiederholen”.
When review queue is cleared, optionally show “Kapitel gemeistert”.

PERSISTENCE
Persist answer, attempts, hint level, solutionShown and status so reload/login does not reset progress.
Review mode must also be resumable.

CONTENT
Use the exact exercises, revised prompts, accepted answers, hints and feedback from the accompanying LangNation Kapitel 09 specification document. Do not invent different answer keys unless you find a technical typo; if you find one, report it before changing content.

IMPLEMENTATION APPROACH
- Inspect and extend existing components/models first.
- Prefer reusable components and data/config.
- If an existing admin homework editor exists, extend it for examples, hints, multiple accepted answers and the new question types.
- If no editor exists, do NOT build a large CMS now. Seed/store Kapitel 09 through the project’s normal content mechanism, structured so an editor can be added later.
- Avoid unnecessary heavy dependencies.
- Keep changes focused and safe.

TESTS
Add evaluator/unit tests for:
- normalization
- each accepted answer variant
- wrong answers
- hint/solution status transitions
- linked two-blank answer
- “nicht” insertion position
- sentence transformation variants
- reading categorization
Add integration/component tests where the project already has a test setup.

FINAL VERIFICATION
Before finishing:
- run existing lint/typecheck/tests/build
- fix errors caused by your changes
- verify desktop + mobile behavior
- verify no clipped right-sidebar labels
- verify progress survives refresh
- verify examples do not affect counts
- verify “Fehler wiederholen” upgrades status correctly
- summarize files changed, migrations/seeds added, and how to add the next chapter using the same data structure.

```