# LangNation Homework & Self-Learning Engine
## Kapitel 10 — Präpositionen

> Source: `LangNation_Kapitel_10_Präpositionen.docx`. Speaking and Writing are excluded. This specification defines **71** countable tasks; the app must calculate totals dynamically.

## Permanent pattern
- Keep the existing LangNation three-column homework layout and dark navy/gold visual identity; do not rebuild unrelated areas.
- Every Übung/Aufgabe starts with a short instruction and 1–2 solved examples. Examples never count toward progress.
- Every student task offers progressive Hint 1 and Hint 2. The answer is never the first hint.
- Use deterministic automatic checking wherever possible. No teacher review is required for these chapters.
- Immediate feedback must teach the rule, not only show green/red.
- Allow retry. „Lösung zeigen“ becomes available only after sufficient effort; using it places the item in „verbessern“ until review.
- After each Übung show a compact congratulation card. After the chapter show a summary and „Fehler wiederholen“.
- Speaking and Writing are excluded from this homework flow and remain separate future modules.
- Right sidebar uses only short labels: Kapitel XX, Übung 1, Übung 2 … Lesetext, Test/Mini-Test. Full titles via tooltip/aria-label.
- All task totals are calculated dynamically; never hard-code counts such as „23 Aufgaben“.

## Documented digital adaptations
- Digital wording fixes the source-key mismatch where the printed prompt already contained „von“ but the key gave „vom“.
- Digital wording fixes the source-key mismatch where the printed prompt already contained „zu“ but the key gave „zum“.
- Die Originalklassifikation mischt Kasus/Präpositionstyp (Akkusativ, Dativ, Wechsel, Genitiv) mit Bedeutung (temporal/lokal). Digital wird das in zwei kontrollierte Teilschritte getrennt, damit ein Ausdruck mehrere Eigenschaften haben kann.
- Die offene Wo→Wohin-Aufgabe wird als geführte Satztransformation umgesetzt.
- Digital adaptation of the original open sentence-writing item so it can be checked automatically.

## Exercises
### Übung 1 – Akkusativ oder Dativ?
- Type: `fill_blank`
- Objective: Kasus und Artikel nach Präposition korrekt bilden.
- Instruction: Ergänze Artikel bzw. Verschmelzung.
- Solved examples:
  - `für ___ Vater (mein)` → **meinen** — für + Akkusativ; maskulin → meinen.
  - `mit ___ Bus (der)` → **dem** — mit + Dativ; maskulin → dem.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 1 | für ___ Bruder (mein) | meinen | für verlangt Akkusativ. | mein + Akkusativ maskulin → meinen. | Richtig: für meinen Bruder. |
| 2 | mit ___ Auto (das) | dem | mit verlangt Dativ. | das Auto → dem Auto. | Richtig: mit dem Auto. |
| 3 | durch ___ Park (der) | den | durch verlangt Akkusativ. | der Park → den Park. | Richtig: durch den Park. |
| 4 | bei ___ Freundin (meine) | meiner | bei verlangt Dativ. | meine Freundin → meiner Freundin. | Richtig: bei meiner Freundin. |
| 5 | ohne ___ Termin (ein) | einen | ohne verlangt Akkusativ. | ein Termin → einen Termin. | Richtig: ohne einen Termin. |
| 6 | Ich komme ___ Bahnhof. (von + der) | vom / von dem | von verlangt Dativ. | von dem kann zu vom verschmelzen. | Bevorzugt: vom Bahnhof; akzeptiert: von dem Bahnhof. |
| 7 | gegen ___ Wand (die) | die | gegen verlangt Akkusativ. | Feminin Akkusativ bleibt die. | Richtig: gegen die Wand. |
| 8 | Ich gehe ___ Arzt. (zu + der) | zum / zu dem | zu verlangt Dativ. | zu dem kann zu zum verschmelzen. | Bevorzugt: zum Arzt; akzeptiert: zu dem Arzt. |

### Übung 2 – Wechselpräpositionen
- Type: `fill_blank`
- Objective: Wo? = Dativ und Wohin? = Akkusativ bei Wechselpräpositionen unterscheiden.
- Instruction: Ergänze die richtige Form.
- Solved examples:
  - `Das Handy liegt auf ___ Tisch. (der)` → **dem** — Wo? → Dativ.
  - `Ich lege das Handy auf ___ Tisch. (der)` → **den** — Wohin? → Akkusativ.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 9 | Das Buch liegt auf ___ Tisch. (der) | dem | Frage: Wo liegt es? | Wo? → Dativ: dem Tisch. | Richtig: dem. |
| 10 | Ich lege das Buch auf ___ Tisch. (der) | den | Frage: Wohin lege ich es? | Wohin? → Akkusativ: den Tisch. | Richtig: den. |
| 11 | Wir sind in ___ Küche. (die) | der | Wo sind wir? | Wo? → Dativ feminin: der. | Richtig: der. |
| 12 | Wir gehen in ___ Küche. (die) | die | Wohin gehen wir? | Wohin? → Akkusativ feminin: die. | Richtig: die. |
| 13 | Das Bild hängt an ___ Wand. (die) | der | Wo hängt das Bild? | Wo? → Dativ feminin: der. | Richtig: der. |
| 14 | Ich hänge das Bild an ___ Wand. (die) | die | Wohin hänge ich es? | Wohin? → Akkusativ feminin: die. | Richtig: die. |

### Übung 3 – Wo oder Wohin?
- Type: `sentence_builder`
- Objective: Aus Wortbausteinen korrekte Sätze mit Wechselpräpositionen bilden.
- Instruction: Ordne die Wörter und wähle Dativ oder Akkusativ passend zu Wo?/Wohin?.
- Solved examples:
  - `ich / sein / in / das Zimmer` → **Ich bin im Zimmer.** — sein → Ort/Wo? → Dativ.
  - `ich / gehen / in / das Zimmer` → **Ich gehe ins Zimmer.** — gehen → Richtung/Wohin? → Akkusativ.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 15 | Ich / sein / in / das Büro. | Ich bin im Büro. / Ich bin in dem Büro. | „sein“ beschreibt einen Ort. | Wo? → Dativ; in dem = im. | Richtig: Ich bin im Büro. |
| 16 | Ich / gehen / in / das Büro. | Ich gehe ins Büro. / Ich gehe in das Büro. | „gehen“ beschreibt eine Richtung. | Wohin? → Akkusativ; in das = ins. | Richtig: Ich gehe ins Büro. |
| 17 | Der Stuhl / stehen / neben / das Fenster. | Der Stuhl steht neben dem Fenster. | stehen = Position. | Wo? → Dativ Neutrum: dem Fenster. | Richtig: ... neben dem Fenster. |
| 18 | Ich / stellen / der Stuhl / neben / das Fenster. | Ich stelle den Stuhl neben das Fenster. | stellen = Bewegung/Ziel. | Wohin? → Akkusativ: den Stuhl / das Fenster. | Richtig: Ich stelle den Stuhl neben das Fenster. |
| 19 | Die Kinder / spielen / auf / der Spielplatz. | Die Kinder spielen auf dem Spielplatz. | spielen findet an einem Ort statt. | Wo? → Dativ: auf dem Spielplatz. | Richtig. |
| 20 | Die Kinder / laufen / auf / der Spielplatz. | Die Kinder laufen auf den Spielplatz. | Hier ist das Ziel gemeint. | Wohin? → Akkusativ: auf den Spielplatz. | Richtig. |

**UI note:** Bevorzugt als Drag-and-drop/Token-Builder umsetzen. Nach Hint 2 kann die Kasus-Endung farblich hervorgehoben werden.

### Übung 4 – nach, in oder zu?
- Type: `fill_blank`
- Objective: Zielpräpositionen nach Ortsart korrekt auswählen und nötige Artikel/Verschmelzungen bilden.
- Instruction: Ergänze die passende Präposition + Artikel, falls nötig.
- Solved examples:
  - `Ich fahre ___ München.` → **nach** — Stadt ohne Artikel → nach.
  - `Wir fahren ___ Türkei.` → **in die** — Land mit Artikel → in + Akkusativ.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 21 | Ich fahre ___ Berlin. | nach | Stadtname ohne Artikel. | Städte/Länder ohne Artikel → nach. | Richtig: nach Berlin. |
| 22 | Wir fliegen ___ Schweiz. | in die | Die Schweiz hat einen Artikel. | Wohin? → in die Schweiz. | Richtig: in die Schweiz. |
| 23 | Sie geht ___ Arzt. | zum / zu dem | Person/Berufsziel → zu. | zu dem → zum. | Richtig: zum Arzt. |
| 24 | Er fährt ___ Arbeit. | zur / zu der | Zur Arbeit = feste Zielangabe. | zu der → zur. | Richtig: zur Arbeit. |
| 25 | Ich gehe ___ Kino. | ins / in das | Gebäude/Ziel → in + Akkusativ. | in das → ins. | Richtig: ins Kino. |
| 26 | Wir reisen ___ Deutschland. | nach | Land ohne Artikel. | nach Deutschland. | Richtig: nach Deutschland. |
| 27 | Sie fährt ___ USA. | in die | USA wird hier mit Artikel im Plural verwendet. | Wohin? → in die USA. | Richtig: in die USA. |
| 28 | Ich gehe ___ Anna. | zu | Zu einer Person. | Kein Artikel nötig. | Richtig: zu Anna. |

### Übung 5 – aus oder von?
- Type: `fill_blank`
- Objective: Herkunft/Quelle mit aus bzw. von/vom unterscheiden.
- Instruction: Ergänze die passende Form.
- Solved examples:
  - `Ich komme ___ dem Haus.` → **aus** — aus einem Innenraum.
  - `Ich komme gerade ___ der Ärztin.` → **von** — von einer Person/Termin.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 29 | Ich komme ___ dem Büro. | aus | Innenraum/Gebäude. | aus + Dativ. | Richtig: aus dem Büro. |
| 30 | Der Zug kommt ___ Berlin. (Herkunft aus einer Stadt) | aus | Herkunft aus Stadt. | aus Berlin. | Richtig: aus. |
| 31 | Ich komme gerade ___ meinem Arzt. | von | Von einer Person/einem Termin. | von + Dativ. | Richtig: von. |
| 32 | Das Geschenk ist ___ meiner Schwester. | von | Urheber/Quelle = Person. | von meiner Schwester. | Richtig: von. |
| 33 | Sie kommt ___ Indien. | aus | Herkunft aus Land. | aus Indien. | Richtig: aus. |
| 34 | Wir gehen ___ Bahnhof nach Hause. | vom / von dem | Ausgangspunkt/Ort → von. | von dem → vom. | Richtig: vom Bahnhof. |

### Übung 6 – Temporale Präpositionen
- Type: `fill_blank`
- Objective: Temporale Präpositionen nach Uhrzeit, Tag, Zeitraum und zeitlichem Bezug unterscheiden.
- Instruction: Ergänze um, am, im, seit, vor, nach, ab, in oder für.
- Solved examples:
  - `___ 7 Uhr beginnt der Kurs.` → **Um** — Uhrzeit → um.
  - `___ Freitag habe ich frei.` → **Am** — Wochentag → am.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 35 | ___ 8 Uhr beginnt der Kurs. | Um | Exakte Uhrzeit. | Uhrzeit → um. | Richtig: um. |
| 36 | ___ Montag habe ich frei. | Am | Wochentag. | an + dem → am. | Richtig: am. |
| 37 | ___ Sommer fahren wir ans Meer. | Im | Jahreszeit. | in + dem → im. | Richtig: im. |
| 38 | Ich wohne ___ drei Jahren hier. | seit | Beginn in der Vergangenheit, dauert bis jetzt. | seit + Dativ. | Richtig: seit. |
| 39 | ___ einer Woche war ich krank. | Vor | Zeitpunkt liegt eine Woche zurück. | vor + Dativ. | Richtig: vor. |
| 40 | ___ dem Kurs gehe ich nach Hause. | Nach | Später als ein Ereignis. | nach + Dativ. | Richtig: nach. |
| 41 | ___ nächster Woche arbeite ich wieder. | Ab | Startpunkt ab einem zukünftigen Zeitpunkt. | ab + Dativ. | Richtig: ab. |
| 42 | ___ zwei Tagen kommt meine Mutter. | In | Zeitspanne bis in die Zukunft. | in zwei Tagen. | Richtig: in. |
| 43 | Ich fahre ___ zwei Wochen nach Indien. | für | Dauer des Aufenthalts. | für + Akkusativ. | Richtig: für. |

### Übung 7 – Verschmelzungen
- Type: `fill_blank`
- Objective: Häufige Präposition-Artikel-Verschmelzungen erkennen und bilden.
- Instruction: Schreibe die Kurzform.
- Solved examples:
  - `in dem Zimmer` → **im Zimmer** — in + dem = im.
  - `zu der Schule` → **zur Schule** — zu + der = zur.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 44 | an dem Montag | am Montag | an + dem. | Verschmelzung: am. | Richtig: am Montag. |
| 45 | in dem Büro | im Büro | in + dem. | Verschmelzung: im. | Richtig: im Büro. |
| 46 | zu dem Arzt | zum Arzt | zu + dem. | Verschmelzung: zum. | Richtig: zum Arzt. |
| 47 | zu der Bank | zur Bank | zu + der. | Verschmelzung: zur. | Richtig: zur Bank. |
| 48 | von dem Bahnhof | vom Bahnhof | von + dem. | Verschmelzung: vom. | Richtig: vom Bahnhof. |
| 49 | in das Kino | ins Kino | in + das. | Verschmelzung: ins. | Richtig: ins Kino. |
| 50 | an das Fenster | ans Fenster | an + das. | Verschmelzung: ans. | Richtig: ans Fenster. |

## Lesetext
### Lesetext – Ein Tag in der Stadt
Am Samstag fährt Nora um neun Uhr mit dem Bus in die Innenstadt. Zuerst geht sie zur Bank. Danach läuft sie durch den Park zum Markt. Auf dem Markt kauft sie Obst für ihre Familie. Gegen Mittag trifft sie eine Freundin vor einem Café. Sie sitzen eine Stunde im Café und sprechen über ihre Pläne. Danach gehen sie ins Museum. Wegen des Regens fahren sie später nicht mit dem Fahrrad, sondern mit der Straßenbahn nach Hause. Nora ist um sechs Uhr wieder zu Hause.

- **R1 — Markiere alle Präpositionsausdrücke im Text.**
  - Accepted: Am Samstag / um neun Uhr / mit dem Bus / in die Innenstadt / zur Bank / durch den Park / zum Markt / Auf dem Markt / für ihre Familie / Gegen Mittag / vor einem Café / im Café / über ihre Pläne / ins Museum / Wegen des Regens / mit dem Fahrrad / mit der Straßenbahn / nach Hause / um sechs Uhr / zu Hause
  - Hint 1: Suche Wörter wie an/um/mit/in/zu/durch/auf/für/gegen/vor/über/wegen/nach.
  - Hint 2: Achte auch auf Verschmelzungen: am, zur, zum, im, ins.
  - Feedback: Positionsbasierte Markierung; 20 Zielausdrücke.
- **R2 — Ordne ausgewählte Ausdrücke nach Grammatiktyp.**
  - Accepted: um neun Uhr=Akkusativpräposition / mit dem Bus=Dativpräposition / in die Innenstadt=Wechselpräposition+Akkusativ / Auf dem Markt=Wechselpräposition+Dativ / Wegen des Regens=Genitivpräposition
  - Hint 1: Bestimme zuerst, welche Präposition vorliegt.
  - Hint 2: Bei Wechselpräpositionen entscheidet Wo/Wohin über den Kasus.
  - Feedback: Diese kontrollierte Auswahl ersetzt die gemischte Originalklassifikation.
- **R3 — Ordne ausgewählte Ausdrücke nach Bedeutung.**
  - Accepted: Am Samstag=temporal / um neun Uhr=temporal / in die Innenstadt=lokal / zur Bank=lokal / mit dem Bus=modal/Verkehrsmittel
  - Hint 1: Frage: Wann? Wo/Wohin? Womit?
  - Hint 2: Nicht jeder Präpositionsausdruck ist temporal oder lokal.
  - Feedback: Die digitale Fassung ergänzt „modal/Verkehrsmittel“, damit die Kategorien vollständig sind.
- **R4 — Finde zwei Verschmelzungen im Text.**
  - Accepted: am / zur / zum / im / ins
  - Hint 1: Suche Kombinationen aus Präposition + Artikel.
  - Hint 2: Mehrere sind möglich; zwei richtige reichen.
  - Feedback: Akzeptiere jede Auswahl von zwei unterschiedlichen Formen aus am/zur/zum/im/ins.
- **R5 — Warum steht in „im Café“ Dativ?**
  - Accepted: Weil es um einen Ort (Wo?) geht. / Weil „in“ hier auf die Frage Wo? antwortet und deshalb Dativ verlangt.
  - Hint 1: Frage: Wo sitzen sie?
  - Hint 2: Bei Wechselpräpositionen: Wo? → Dativ.
  - Feedback: Inhaltlich richtige kontrollierte Erklärung.
- **R6 — Forme um: „Sie sitzen im Café.“ → Wohin-Satz mit „gehen“.**
  - Accepted: Sie gehen ins Café. / Sie gehen in das Café.
  - Hint 1: Aus Wo? soll Wohin? werden.
  - Hint 2: in + Akkusativ; in das = ins.
  - Feedback: Richtig: Sie gehen ins Café.

## Test
- **T1 — mit ___ Auto**
  - Accepted: dem
  - Hint 1: mit + Dativ.
  - Hint 2: das Auto → dem.
  - Feedback: Richtig: dem.
- **T2 — für ___ Bruder**
  - Accepted: meinen
  - Hint 1: für + Akkusativ.
  - Hint 2: mein Bruder → meinen Bruder.
  - Feedback: Richtig: meinen.
- **T3 — Wo? Das Buch liegt auf ___ Tisch.**
  - Accepted: dem
  - Hint 1: Wo? → Dativ.
  - Hint 2: der Tisch → dem Tisch.
  - Feedback: Richtig: dem.
- **T4 — Wohin? Ich lege das Buch auf ___ Tisch.**
  - Accepted: den
  - Hint 1: Wohin? → Akkusativ.
  - Hint 2: der Tisch → den Tisch.
  - Feedback: Richtig: den.
- **T5 — Ich fahre ___ Berlin.**
  - Accepted: nach
  - Hint 1: Stadt ohne Artikel.
  - Hint 2: nach Berlin.
  - Feedback: Richtig: nach.
- **T6 — Wir fahren ___ Schweiz.**
  - Accepted: in die
  - Hint 1: Land mit Artikel.
  - Hint 2: Wohin? → in die Schweiz.
  - Feedback: Richtig: in die.
- **T7 — Ich gehe ___ Arzt.**
  - Accepted: zum / zu dem
  - Hint 1: zu + Dativ.
  - Hint 2: zu dem → zum.
  - Feedback: Richtig: zum.
- **T8 — Ich bin ___ Hause.**
  - Accepted: zu
  - Hint 1: Feste Verbindung.
  - Hint 2: zu Hause = Ort.
  - Feedback: Richtig: zu.
- **T9 — Ich gehe ___ Hause.**
  - Accepted: nach
  - Hint 1: Feste Verbindung.
  - Hint 2: nach Hause = Richtung.
  - Feedback: Richtig: nach.
- **T10 — ___ Montag.**
  - Accepted: am
  - Hint 1: Wochentag.
  - Hint 2: an dem → am.
  - Feedback: Richtig: am.
- **T11 — ___ 8 Uhr.**
  - Accepted: um
  - Hint 1: Uhrzeit.
  - Hint 2: um 8 Uhr.
  - Feedback: Richtig: um.
- **T12 — Ich wohne ___ drei Jahren hier.**
  - Accepted: seit
  - Hint 1: Dauer bis heute.
  - Hint 2: seit drei Jahren.
  - Feedback: Richtig: seit.
- **T13 — wegen ___ Wetters.**
  - Accepted: des
  - Hint 1: wegen + Genitiv.
  - Hint 2: das Wetter → des Wetters.
  - Feedback: Richtig: des.
- **T14 — Bilde die Kurzform: in dem Büro.**
  - Accepted: im Büro
  - Hint 1: in + dem = im.
  - Hint 2: Schreibe die ganze Kurzform.
  - Feedback: Richtig: im Büro.
- **T15 — Geführte Wo/Wohin-Paaraufgabe: 1) Der Schlüssel liegt ___ Tasche. 2) Ich lege den Schlüssel ___ Tasche.**
  - Accepted: in der|in die
  - Hint 1: Erster Satz: Wo? Zweiter: Wohin?
  - Hint 2: Wo → Dativ; Wohin → Akkusativ.
  - Feedback: Richtig: in der Tasche / in die Tasche.

## Claude Code / Codex prompt
```text
You are working inside the existing LangNation language-school website repository.

TASK
Implement the attached LangNation Homework Specification for Kapitel 10 — Präpositionen using the reusable self-learning homework engine already established for Kapitel 09.

PRIMARY GOAL
Maximum learning output from the student with minimum teacher interaction.

FIRST
1. Inspect the existing repository and the current Homework implementation before changing anything.
2. Reuse the Kapitel 09 generic components/evaluators/progress system if they already exist.
3. Do not create a second homework engine and do not hard-code a separate page architecture for this chapter.
4. Preserve auth, enrollment, routes, database conventions and the LangNation dark navy/gold design.

SCOPE
- Implement all Übungen, the Lesetext interactive tasks, and the Test.
- Speaking and Writing are out of scope.
- Use the exact revised prompts, accepted-answer variants, hints, feedback and documented digital adaptations from this specification.
- This specification currently defines 71 countable student tasks. The UI must still calculate totals dynamically from data.

COMMON STUDENT FLOW
instruction → solved example(s) → attempt → Hint 1 → Hint 2 → check → explanatory feedback → retry → completion card → review

PROGRESS
green = richtig
yellow = mit Hinweis
red = verbessern
gray = offen

SIDEBAR
Use short labels only:
Kapitel 10
Übung 1
Übung 2
...
Lesetext
Test

ANSWER CHECKING
- Unicode NFC normalize
- trim and collapse repeated spaces
- ignore optional final punctuation for controlled sentence answers
- support all accepted-answer variants listed in the spec
- do not silently accept arbitrary spelling errors
- use soft capitalization/orthography warnings where appropriate
- do not use a runtime LLM to judge controlled grammar answers

HINT / SOLUTION RULES
- Hint 1 = conceptual clue
- Hint 2 = targeted clue
- „Lösung zeigen“ separate and only after effort
- solutionShown => red/verbessern until review
- review without hint can upgrade to green; review with hint to yellow

PERSISTENCE
Persist answer, attempts, hint level, solutionShown and status. Progress and review queues must survive refresh/login.

REUSABILITY
Store chapter content as structured data/config using the current project’s normal content/database approach. Extend existing generic types/components when needed. If a new reusable question type is necessary, implement it generically so later chapters can use it.

TESTS
Add/extend evaluator tests for every accepted answer variant and every new interaction type introduced by this chapter. Also test status transitions, persistence and examples-not-counted behavior.

FINAL VERIFICATION
Run the repository’s existing lint/typecheck/tests/build. Fix issues caused by the changes. Verify desktop/mobile, keyboard usability, no clipped sidebar labels, dynamic counts, chapter completion and Fehler wiederholen.

Before coding, give a concise plan based on the actual repository. After implementation, summarize files changed, migrations/seeds/config added, tests run, and how the chapter data can be edited later.

```