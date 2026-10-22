# LangNation Homework & Self-Learning Engine
## Kapitel 08 — Pronomen

> Source: `LangNation_Kapitel_08_Pronomen.docx`. Speaking and Writing are excluded. This specification defines **58** countable tasks; the app must calculate totals dynamically.

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
- Die Originalaufgabe „Finde drei Possessivformen“ ist im Text nicht sauber erfüllt: eindeutig vorhanden sind „Ihr“ und „deiner“. Digital wird deshalb „Markiere alle Possessivformen“ verwendet und genau diese zwei erwartet.
- Die Originalfrage „Wofür steht ‚sie‘ in ‚zeigt ihr das Büro‘?“ verweist auf ein Pronomen, das in diesem Teilsatz nicht vorkommt. Digital wird daraus: „Wofür steht ‚ihr‘ in ‚zeigt ihr das Büro‘?“ → Mira.
- Digital adaptation: Original asks for a free explanation; converted to a controlled concept-choice item.
- Digital adaptation of the original free sentence-writing task.
- Digital adaptation of the original free sentence-writing task.

## Exercises
### Übung 1 – Personalpronomen einsetzen
- Type: `fill_blank`
- Objective: Nomengruppen durch passende Personalpronomen im richtigen Kasus ersetzen.
- Instruction: Ersetze die markierte Nomengruppe durch ein Pronomen.
- Solved examples:
  - `Ich sehe die Frau. → Ich sehe ___.` → **sie** — Akkusativ feminin → sie.
  - `Ich helfe dem Mann. → Ich helfe ___.` → **ihm** — helfen + Dativ; maskulin → ihm.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 1 | Ich sehe den Mann. → Ich sehe ___. | ihn | Welche Funktion hat „den Mann“? | Akkusativ maskulin → ihn. | Richtig: Ich sehe ihn. |
| 2 | Ich helfe der Frau. → Ich helfe ___. | ihr | Das Verb „helfen“ verlangt Dativ. | Dativ feminin → ihr. | Richtig: Ich helfe ihr. |
| 3 | Der Lehrer spricht mit den Studenten. → Er spricht mit ___. | ihnen | „mit“ verlangt Dativ. | Dativ Plural → ihnen. | Richtig: mit ihnen. |
| 4 | Das Kind schläft. → ___ schläft. | Es | „das Kind“ ist Neutrum und Subjekt. | Nominativ Neutrum → es. | Richtig: Es schläft. |
| 5 | Ich besuche meine Eltern. → Ich besuche ___. | sie | „meine Eltern“ steht im Akkusativ Plural. | Akkusativ Plural → sie. | Richtig: Ich besuche sie. |
| 6 | Können Sie Frau Berger helfen? → Können Sie ___ helfen? | ihr | helfen + Dativ. | Dativ feminin → ihr. | Richtig: Können Sie ihr helfen? |

### Übung 2 – Akkusativ oder Dativ?
- Type: `fill_blank`
- Objective: Kasus durch Verb/Struktur erkennen und das passende Personalpronomen einsetzen.
- Instruction: Setze das passende Personalpronomen ein.
- Solved examples:
  - `Kannst du ___ sehen? (ich)` → **mich** — sehen + Akkusativ → mich.
  - `Kannst du ___ helfen? (du)` → **dir** — helfen + Dativ → dir.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 7 | Kannst du ___ helfen? (ich) | mir | Welchen Kasus verlangt „helfen“? | Dativ von ich = mir. | Richtig: mir. |
| 8 | Ich sehe ___. (du) | dich | sehen + Akkusativ. | Akkusativ von du = dich. | Richtig: dich. |
| 9 | Die Jacke gefällt ___. (sie, Singular) | ihr | gefallen + Dativ. | Dativ von sie = ihr. | Richtig: ihr. |
| 10 | Wir besuchen ___. (er) | ihn | besuchen + Akkusativ. | Akkusativ von er = ihn. | Richtig: ihn. |
| 11 | Der Lehrer antwortet ___. (wir) | uns | antworten + Dativ. | Dativ von wir = uns. | Richtig: uns. |
| 12 | Ich danke ___. (Sie, formell) | Ihnen | danken + Dativ; formelle Anrede groß. | Dativ von Sie = Ihnen. | Richtig: Ihnen. |

### Übung 3 – Possessivartikel
- Type: `fill_blank`
- Objective: Possessivartikel nach Person und Nomen richtig auswählen.
- Instruction: Ergänze die passende Form.
- Solved examples:
  - `Ich habe eine Schwester. Das ist ___ Schwester.` → **meine** — ich → mein-; feminin → meine.
  - `Wir haben ein Auto. Das ist ___ Auto.` → **unser** — wir → unser-; Neutrum Nominativ → unser.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 13 | Ich habe einen Bruder. Das ist ___ Bruder. | mein | Wem gehört der Bruder? | ich → mein-. Bruder ist maskulin. | Richtig: mein Bruder. |
| 14 | Du hast eine Tasche. Das ist ___ Tasche. | deine | du → dein-. | Tasche ist feminin → deine. | Richtig: deine Tasche. |
| 15 | Er hat ein Auto. Das ist ___ Auto. | sein | er → sein-. | Auto ist Neutrum → sein. | Richtig: sein Auto. |
| 16 | Wir haben Kinder. Das sind ___ Kinder. | unsere | wir → unser-. | Plural → unsere. | Richtig: unsere Kinder. |
| 17 | Ihr habt einen Kurs. Das ist ___ Kurs. | euer | ihr → euer-. | Vor maskulinem Nomen ohne Endung: euer Kurs. | Richtig: euer Kurs. |
| 18 | Frau Klein, ist das ___ Pass? | Ihr | Formelle Anrede „Sie“. | Possessivartikel zu Sie wird großgeschrieben: Ihr. | Richtig: Ihr Pass. |

### Übung 4 – Possessivpronomen
- Type: `fill_blank`
- Objective: Possessivpronomen verwenden, wenn das Nomen bereits bekannt ist.
- Instruction: Ersetze Nomen + Possessivartikel, wenn möglich.
- Solved examples:
  - `Das ist mein Auto. → Das ist ___.` → **meins** — Auto = Neutrum; das Nomen wird ersetzt.
  - `Ist das deine Jacke? → Nein, das ist ___.` → **meine** — Jacke = feminin; alleinstehendes Possessivpronomen.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 19 | Das ist mein Buch. → Das ist ___. | meins | Das Nomen „Buch“ ist schon bekannt. | Neutrum → meins. | Richtig: Das ist meins. |
| 20 | Ist das deine Tasche? → Ja, das ist ___. | meine | Tasche ist feminin. | Alleinstehend: meine. | Richtig: das ist meine. |
| 21 | Das ist sein Handy. → Das ist ___. | seins | Handy ist Neutrum. | sein + s → seins. | Richtig: Das ist seins. |
| 22 | Das sind unsere Stühle. → Das sind ___. | unsere | Stühle = Plural. | Pluralform bleibt unsere. | Richtig: Das sind unsere. |

### Übung 5 – Wer, wen, wem oder wessen?
- Type: `fill_blank`
- Objective: Fragepronomen passend zu Nominativ, Akkusativ, Dativ und Besitz auswählen.
- Instruction: Ergänze das richtige Fragepronomen.
- Solved examples:
  - `___ kommt heute?` → **Wer** — Subjekt/Person → Wer.
  - `___ hilfst du?` → **Wem** — helfen + Dativ → Wem.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 23 | ___ kommt heute? | Wer | Gesucht ist das Subjekt. | Person im Nominativ → Wer. | Richtig: Wer. |
| 24 | ___ besuchst du? | Wen | besuchen + Akkusativ. | Person im Akkusativ → Wen. | Richtig: Wen. |
| 25 | ___ hilfst du? | Wem | helfen + Dativ. | Person im Dativ → Wem. | Richtig: Wem. |
| 26 | ___ Auto ist das? | Wessen | Gefragt wird nach Besitz. | Besitz/Zugehörigkeit → Wessen. | Richtig: Wessen. |
| 27 | Mit ___ sprichst du? | wem | „mit“ verlangt Dativ. | Nach mit: wem. | Richtig: Mit wem ...? |
| 28 | ___ fragst du? | Wen | fragen + Akkusativ. | Person im Akkusativ → Wen. | Richtig: Wen. |

### Übung 6 – Indefinitpronomen
- Type: `fill_blank_adaptive`
- Objective: man, jemand, niemand, etwas, nichts, alle, einige und manche nach Bedeutung unterscheiden.
- Instruction: Ergänze das passende Indefinitpronomen.
- Solved examples:
  - `___ wartet vor der Tür.` → **Jemand** — unbestimmte Person → jemand.
  - `Ich sehe ___.` → **nichts** — keine Sache → nichts.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 29 | Hier ist ___. Die Wohnung ist leer. | niemand | Gesucht ist „keine Person“. | Niemand = keine Person. | Richtig: niemand. |
| 30 | Ich möchte ___ trinken. | etwas | Gesucht ist eine unbestimmte Sache/Menge. | etwas = eine nicht bestimmte Sache/Menge. | Richtig: etwas. |
| 31 | ___ sagt, dass Deutsch schwer ist. | man | Allgemeine Aussage über Menschen. | man = unpersönliches Pronomen; nicht Mann. | Richtig: Man. |
| 32 | ___ Studenten sind heute krank, aber die meisten sind da. | einige / manche | Nur ein Teil der Gruppe ist krank. | Einige und manche passen beide zur Aussage. | Akzeptiert: einige / manche. |
| 33 | Ich habe gesucht, aber ich finde ___. | nichts | Es wird keine Sache gefunden. | nichts = keine Sache. | Richtig: nichts. |
| 34 | ___ Teilnehmer haben die Aufgabe verstanden. | einige / manche | Es geht um einen Teil der Gruppe. | Einige oder manche sind beide möglich. | Akzeptiert: einige / manche. |

**UI note:** Nach einem Fehlversuch kann eine kleine Wortbank erscheinen: man · jemand · niemand · etwas · nichts · alle · einige · manche.

### Übung 7 – Wortstellung mit Pronomen
- Type: `sentence_transform`
- Objective: Objektpronomen einsetzen und bei zwei Pronomen die Grundreihenfolge Akkusativ vor Dativ anwenden.
- Instruction: Forme um.
- Solved examples:
  - `Ich gebe der Frau den Schlüssel. → Ersetze „der Frau“.` → **Ich gebe ihr den Schlüssel.** — Dativnomen → Dativpronomen.
  - `Ich gebe der Frau den Schlüssel. → Ersetze beide.` → **Ich gebe ihn ihr.** — Bei zwei Pronomen: Akkusativ vor Dativ.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 35 | Ich gebe dem Mann das Buch. → Ersetze „dem Mann“. | Ich gebe ihm das Buch. | Nur das Dativobjekt wird ersetzt. | dem Mann → ihm. | Richtig: Ich gebe ihm das Buch. |
| 36 | Ich gebe dem Mann das Buch. → Ersetze „das Buch“. | Ich gebe es dem Mann. | Nur das Akkusativobjekt wird ersetzt. | das Buch → es. | Richtig: Ich gebe es dem Mann. |
| 37 | Ich gebe dem Mann das Buch. → Ersetze beide. | Ich gebe es ihm. | Beide Objekte werden Pronomen. | Bei zwei Pronomen steht meist Akkusativ vor Dativ. | Richtig: Ich gebe es ihm. |
| 38 | Sie zeigt der Kundin die Wohnung. → Ersetze beide Objekte. | Sie zeigt sie ihr. | die Wohnung → sie; der Kundin → ihr. | Akkusativpronomen vor Dativpronomen. | Richtig: Sie zeigt sie ihr. |

**UI note:** Für diese Übung ist ein Satz-/Token-Builder besser als ein großes Freitextfeld. Nach Hint 2 kann die UI die Pronomen als draggable tokens anbieten.

## Lesetext
### Lesetext – Ein neues Team
Mira beginnt heute in einer neuen Firma. Ihr Chef begrüßt sie und zeigt ihr das Büro. „Dieser Schreibtisch ist deiner“, sagt er. Einige Kollegen sind schon da. Einer von ihnen bringt ihr einen Kaffee. Mira kennt noch niemanden, aber alle sind freundlich. Ein Kollege fragt sie: „Kann ich dir etwas erklären?“ Mira antwortet: „Danke, im Moment brauche ich nichts.“ Später stellt der Chef sie dem ganzen Team vor.

- **R1 — Markiere alle Personalpronomen im Text.**
  - Accepted: sie / ihr / er / ihnen / ihr / sie / ich / dir / ich / sie
  - Hint 1: Suche Wörter, die Personen direkt ersetzen.
  - Hint 2: Possessivformen wie „Ihr“ und Indefinitpronomen wie „niemanden“ gehören nicht dazu.
  - Feedback: Die UI prüft markierte Text-Spans; Wiederholungen werden positionsbezogen gespeichert.
- **R2 — Markiere alle Possessivformen im Text.**
  - Accepted: Ihr / deiner
  - Hint 1: Suche nach Zugehörigkeit/Besitz.
  - Hint 2: Eine Form steht vor „Chef“, eine ersetzt „Schreibtisch“.
  - Feedback: Richtig: Ihr · deiner.
- **R3 — Markiere alle Indefinitpronomen im Text.**
  - Accepted: Einige / Einer / niemanden / alle / etwas / nichts
  - Hint 1: Suche unbestimmte Personen/Sachen/Mengen.
  - Hint 2: Dazu gehören u. a. jemand/niemand/etwas/nichts/alle/einige.
  - Feedback: Die UI prüft alle sechs positionsbezogenen Treffer.
- **R4 — Wofür steht „ihr“ in „zeigt ihr das Büro“?**
  - Accepted: Mira / für Mira
  - Hint 1: Wer bekommt das Büro gezeigt?
  - Hint 2: Das Pronomen „ihr“ bezieht sich auf die neue Mitarbeiterin.
  - Feedback: Richtig: Mira.
- **R5 — Ersetze die Pronomen durch Nomen: „Ihr Chef begrüßt sie und zeigt ihr das Büro.“**
  - Accepted: Miras Chef begrüßt Mira und zeigt Mira das Büro. / Der Chef begrüßt Mira und zeigt Mira das Büro.
  - Hint 1: Ersetze beide Pronomen, die auf Mira verweisen.
  - Hint 2: sie + ihr → Mira; „Ihr Chef“ kann als „Miras Chef“ formuliert werden.
  - Feedback: Akzeptiert werden die beiden kontrollierten Varianten.

## Mini-Test
- **T1 — Ersetze „den Mann“: Ich sehe ___.**
  - Accepted: ihn
  - Hint 1: Akkusativ maskulin.
  - Hint 2: er → ihn.
  - Feedback: Richtig: ihn.
- **T2 — Ersetze „der Frau“: Ich helfe ___.**
  - Accepted: ihr
  - Hint 1: helfen + Dativ.
  - Hint 2: sie → ihr.
  - Feedback: Richtig: ihr.
- **T3 — Das ist ___ Bruder. (ich)**
  - Accepted: mein
  - Hint 1: ich → mein-.
  - Hint 2: Bruder maskulin.
  - Feedback: Richtig: mein.
- **T4 — Frau Weber, ist das ___ Tasche?**
  - Accepted: Ihre
  - Hint 1: Formelle Anrede.
  - Hint 2: Sie → Ihr-; Tasche feminin → Ihre.
  - Feedback: Richtig: Ihre.
- **T5 — Wer/Wen/Wem: ___ hilfst du?**
  - Accepted: Wem
  - Hint 1: helfen + Dativ.
  - Hint 2: Dativfrage → Wem.
  - Feedback: Richtig: Wem.
- **T6 — Wer/Wen/Wem: ___ besuchst du?**
  - Accepted: Wen
  - Hint 1: besuchen + Akkusativ.
  - Hint 2: Akkusativfrage → Wen.
  - Feedback: Richtig: Wen.
- **T7 — ___ sagt, dass man hier gut essen kann. (allgemein)**
  - Accepted: Man
  - Hint 1: Allgemeine Person(en).
  - Hint 2: Nicht „Mann“.
  - Feedback: Richtig: Man.
- **T8 — Ich sehe ___. (keine Sache)**
  - Accepted: nichts
  - Hint 1: keine Sache = nichts.
  - Hint 2: Kein Nomen folgt.
  - Feedback: Richtig: nichts.
- **T9 — Korrigiere: „Mann spricht hier Deutsch.“**
  - Accepted: Man spricht hier Deutsch.
  - Hint 1: Hier ist das unpersönliche Pronomen gemeint.
  - Hint 2: man ≠ Mann.
  - Feedback: Richtig: Man spricht hier Deutsch.
- **T10 — Ich gebe dem Kind das Buch. → Ersetze beide Objekte.**
  - Accepted: Ich gebe es ihm.
  - Hint 1: das Buch → es; dem Kind → ihm.
  - Hint 2: Bei zwei Pronomen: Akkusativ vor Dativ.
  - Feedback: Richtig: Ich gebe es ihm.
- **T11 — ___ Mann hier ist mein Lehrer. (dieser)**
  - Accepted: Dieser
  - Hint 1: Maskulin Nominativ.
  - Hint 2: dieser Mann.
  - Feedback: Richtig: Dieser.
- **T12 — ___ Bücher dort sind neu. (dieser)**
  - Accepted: Diese
  - Hint 1: Plural Nominativ.
  - Hint 2: diese Bücher.
  - Feedback: Richtig: Diese.
- **T13 — Wähle die richtige Erklärung zu „mein Buch“ und „meins“.**
  - Accepted: mein Buch = Possessivartikel + Nomen; meins = Possessivpronomen und ersetzt das Nomen.
  - Hint 1: Welche Form steht direkt vor einem Nomen?
  - Hint 2: „meins“ kann allein stehen.
  - Feedback: Richtig: „mein Buch“ enthält das Nomen; „meins“ ersetzt es.
- **T14 — Setze „jemand“ ein: ___ wartet draußen.**
  - Accepted: Jemand
  - Hint 1: Gesucht ist eine unbestimmte Person.
  - Hint 2: Am Satzanfang groß.
  - Feedback: Richtig: Jemand.
- **T15 — Setze „niemand“ ein: ___ ist heute im Büro.**
  - Accepted: Niemand
  - Hint 1: Gesucht ist „keine Person“.
  - Hint 2: Am Satzanfang groß.
  - Feedback: Richtig: Niemand.

## Claude Code / Codex prompt
```text
You are working inside the existing LangNation language-school website repository.

TASK
Implement the attached LangNation Homework Specification for Kapitel 08 — Pronomen using the reusable self-learning homework engine already established for Kapitel 09.

PRIMARY GOAL
Maximum learning output from the student with minimum teacher interaction.

FIRST
1. Inspect the existing repository and the current Homework implementation before changing anything.
2. Reuse the Kapitel 09 generic components/evaluators/progress system if they already exist.
3. Do not create a second homework engine and do not hard-code a separate page architecture for this chapter.
4. Preserve auth, enrollment, routes, database conventions and the LangNation dark navy/gold design.

SCOPE
- Implement all Übungen, the Lesetext interactive tasks, and the Mini-Test.
- Speaking and Writing are out of scope.
- Use the exact revised prompts, accepted-answer variants, hints, feedback and documented digital adaptations from this specification.
- This specification currently defines 58 countable student tasks. The UI must still calculate totals dynamically from data.

COMMON STUDENT FLOW
instruction → solved example(s) → attempt → Hint 1 → Hint 2 → check → explanatory feedback → retry → completion card → review

PROGRESS
green = richtig
yellow = mit Hinweis
red = verbessern
gray = offen

SIDEBAR
Use short labels only:
Kapitel 08
Übung 1
Übung 2
...
Lesetext
Mini-Test

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