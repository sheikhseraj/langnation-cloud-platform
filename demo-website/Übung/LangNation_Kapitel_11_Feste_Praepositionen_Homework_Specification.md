# LangNation Homework & Self-Learning Engine
## Kapitel 11 — Feste Präpositionen

> Source: `LangNation_Kapitel_11_Feste Präpositionen.docx`. Speaking and Writing are excluded. This specification defines **51** countable tasks; the app must calculate totals dynamically.

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
- Sprechen und Schreiben werden entfernt; der Lesetext bleibt vollständig auto-checkbar.
- Digital adaptation of the source item with individuelle Lösung.

## Exercises
### Übung 1 – Ergänze die Präposition
- Type: `fill_blank`
- Objective: Feste Verb-Präposition-Verbindungen sicher verwenden.
- Instruction: Setze die passende Präposition ein.
- Solved examples:
  - `Ich freue mich ___ das Wochenende.` → **auf** — sich freuen auf.
  - `Wir sprechen ___ dem Projekt.` → **über** — sprechen über eine Sache.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 1 | Ich warte ___ den Bus. | auf | Welche Präposition gehört fest zu „warten“? | warten auf + Akkusativ. | Richtig: auf. |
| 2 | Sie interessiert sich ___ Sprachen. | für | Feste Verbindung: sich interessieren ... | sich interessieren für. | Richtig: für. |
| 3 | Wir nehmen ___ einem Seminar teil. | an | teilnehmen ... | teilnehmen an + Dativ. | Richtig: an. |
| 4 | Er träumt ___ einem Haus am Meer. | von | träumen ... | träumen von + Dativ. | Richtig: von. |
| 5 | Ich spreche ___ meiner Kollegin. | mit | Person als Gesprächspartner. | sprechen mit + Dativ. | Richtig: mit. |
| 6 | Wir sprechen ___ das neue Projekt. | über | Thema/Sache. | sprechen über + Akkusativ. | Richtig: über. |
| 7 | Sie bittet ___ Hilfe. | um | bitten ... | bitten um + Akkusativ. | Richtig: um. |
| 8 | Das hängt ___ der Situation ab. | von | abhängen ... | abhängen von + Dativ. | Richtig: von. |

### Übung 2 – Akkusativ oder Dativ?
- Type: `fill_blank`
- Objective: Den Kasus nach fester Präposition korrekt bilden.
- Instruction: Ergänze den richtigen Artikel.
- Solved examples:
  - `Ich warte auf ___ Bus. (der)` → **den** — auf bei warten → Akkusativ.
  - `Ich spreche mit ___ Chef. (der)` → **dem** — mit → Dativ.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 9 | Ich warte auf ___ Zug. (der) | den | warten auf + Akkusativ. | der Zug → den Zug. | Richtig: den. |
| 10 | Sie nimmt an ___ Besprechung teil. (die) | der | teilnehmen an + Dativ. | die Besprechung → der. | Richtig: der. |
| 11 | Er interessiert sich für ___ Kurs. (der) | den | für + Akkusativ. | der Kurs → den. | Richtig: den. |
| 12 | Wir sprechen mit ___ Lehrer. (der) | dem | mit + Dativ. | der Lehrer → dem. | Richtig: dem. |
| 13 | Sie träumt von ___ Reise. (die) | einer / der | von + Dativ. | Je nach Bestimmtheit: einer/der Reise. | Akzeptiert: einer / der. |
| 14 | Ich bin mit ___ Ergebnis zufrieden. (das) | dem | mit + Dativ. | das Ergebnis → dem. | Richtig: dem. |

### Übung 3 – da(r)-Komposita
- Type: `fill_blank`
- Objective: Bei Sachen feste Präpositionen durch da(r)-Komposita ersetzen.
- Instruction: Ersetze die markierte Sache durch ein da(r)-Kompositum.
- Solved examples:
  - `Ich denke an die Prüfung. → Ich denke ___.` → **daran** — da + r + an = daran.
  - `Wir sprechen über das Thema. → Wir sprechen ___.` → **darüber** — da + r + über = darüber.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 15 | Ich warte auf den Termin. → Ich warte ___. | darauf | auf beginnt mit Vokal. | da + r + auf = darauf. | Richtig: darauf. |
| 16 | Wir sprechen über das Problem. → Wir sprechen ___. | darüber | über beginnt mit Vokal. | da + r + über = darüber. | Richtig: darüber. |
| 17 | Sie denkt an die Prüfung. → Sie denkt ___. | daran | an beginnt mit Vokal. | da + r + an = daran. | Richtig: daran. |
| 18 | Er träumt von einem neuen Auto. → Er träumt ___. | davon | von beginnt mit Konsonant. | da + von = davon. | Richtig: davon. |
| 19 | Ich interessiere mich für den Kurs. → Ich interessiere mich ___. | dafür | für beginnt mit Konsonant. | da + für = dafür. | Richtig: dafür. |

### Übung 4 – wo(r)-Fragen
- Type: `sentence_transform`
- Objective: Bei Sachen Fragen mit wo(r)- + Präposition bilden.
- Instruction: Bilde eine Frage nach der Sache.
- Solved examples:
  - `Ich denke an das Problem.` → **Woran denkst du?** — wo + r + an.
  - `Wir sprechen über die Prüfung.` → **Worüber sprecht ihr?** — wo + r + über.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 20 | Ich warte auf den Zug. | Worauf wartest du? | Es geht um eine Sache. | wo + r + auf = worauf. | Richtig: Worauf wartest du? |
| 21 | Sie interessiert sich für Kunst. | Wofür interessiert sie sich? | Präposition = für. | wo + für = wofür. | Richtig. |
| 22 | Er denkt an die Reise. | Woran denkt er? | Präposition = an. | wo + r + an = woran. | Richtig. |
| 23 | Wir sprechen über die Prüfung. | Worüber sprecht ihr? | Präposition = über. | wo + r + über = worüber. | Richtig. |
| 24 | Sie ist mit dem Ergebnis zufrieden. | Womit ist sie zufrieden? | Präposition = mit. | wo + mit = womit. | Richtig. |

**UI note:** Als geführten Frage-Builder umsetzen: wo(r)-Baustein + Verb + Subjekt. Das reduziert reine Tippfehler.

### Übung 5 – Person oder Sache?
- Type: `sentence_transform`
- Objective: Zwischen Präposition + wen/wem (Person) und wo(r)-Kompositum (Sache) unterscheiden.
- Instruction: Bilde die passende Frage.
- Solved examples:
  - `Ich spreche mit Lena.` → **Mit wem sprichst du?** — Person → mit wem.
  - `Ich arbeite mit dem Programm.` → **Womit arbeitest du?** — Sache → womit.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 25 | Ich spreche mit Anna. | Mit wem sprichst du? | Anna ist eine Person. | Person + mit → mit wem. | Richtig. |
| 26 | Ich arbeite mit einem neuen Programm. | Womit arbeitest du? | Programm ist eine Sache. | Sache + mit → womit. | Richtig. |
| 27 | Er wartet auf seinen Bruder. | Auf wen wartet er? | Bruder = Person. | Person + auf → auf wen. | Richtig. |
| 28 | Er wartet auf den Termin. | Worauf wartet er? | Termin = Sache/Ereignis. | Sache + auf → worauf. | Richtig. |
| 29 | Sie denkt an ihre Mutter. | An wen denkt sie? | Mutter = Person. | Person + an → an wen. | Richtig. |
| 30 | Sie denkt an die Prüfung. | Woran denkt sie? | Prüfung = Sache/Ereignis. | Sache + an → woran. | Richtig. |

### Übung 6 – Verb, Nomen oder Adjektiv?
- Type: `fill_blank`
- Objective: Feste Präpositionen in Verb-, Nomen- und Adjektivverbindungen erkennen.
- Instruction: Vervollständige die feste Verbindung.
- Solved examples:
  - `Angst ___ etwas haben` → **vor** — Angst vor.
  - `zufrieden ___ etwas sein` → **mit** — zufrieden mit.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 31 | Interesse ___ etwas haben | an | Nomenverbindung. | Interesse an. | Richtig: an. |
| 32 | ___ etwas/jemanden stolz sein | auf | Adjektivverbindung. | stolz auf. | Richtig: auf. |
| 33 | ___ einer Aktivität teilnehmen | an | Verbverbindung. | teilnehmen an. | Richtig: an. |
| 34 | zufrieden ___ etwas sein | mit | Adjektivverbindung. | zufrieden mit. | Richtig: mit. |
| 35 | ___ etwas/jemanden warten | auf | Verbverbindung. | warten auf. | Richtig: auf. |
| 36 | Erfahrung ___ etwas haben | mit | Nomenverbindung. | Erfahrung mit. | Richtig: mit. |

## Lesetext
### Lesetext – Ein neuer Job
Mina interessiert sich seit Langem für digitale Berufe. Deshalb hat sie sich um eine Stelle bei einem IT-Unternehmen beworben. Jetzt wartet sie auf eine Antwort. Sie spricht oft mit einer Freundin über die Bewerbung und denkt jeden Tag daran. Mina hat bereits Erfahrung mit verschiedenen Programmen und ist besonders an Cloud-Technologien interessiert. Sie freut sich auf neue Aufgaben, hat aber auch ein bisschen Angst vor dem Vorstellungsgespräch. Trotzdem ist sie stolz auf ihre bisherigen Erfolge.

- **R1 — Markiere alle festen Präpositionsverbindungen im Text.**
  - Accepted: interessiert sich ... für / sich um ... beworben / wartet ... auf / spricht ... mit / spricht ... über / denkt ... daran / Erfahrung mit / an ... interessiert / freut sich auf / Angst vor / stolz auf
  - Hint 1: Suche Verb/Nomen/Adjektiv + feste Präposition.
  - Hint 2: Achte auch auf das da(r)-Kompositum „daran“.
  - Feedback: Positionsbasierte Markierung; 11 Zielverbindungen.
- **R2 — Welche Präposition steht nach „sich interessieren“?**
  - Accepted: für
  - Hint 1: Feste Verbindung.
  - Hint 2: sich interessieren für.
  - Feedback: Richtig: für.
- **R3 — Worauf wartet Mina?**
  - Accepted: Sie wartet auf eine Antwort. / Auf eine Antwort.
  - Hint 1: Suche den Satz mit „wartet“.
  - Hint 2: warten auf ...
  - Feedback: Inhalt: auf eine Antwort.
- **R4 — Worüber spricht sie mit ihrer Freundin?**
  - Accepted: Sie spricht über die Bewerbung. / Über die Bewerbung.
  - Hint 1: Suche nach „spricht ... über“.
  - Hint 2: Das Thema ist die Bewerbung.
  - Feedback: Richtig: über die Bewerbung.
- **R5 — Wovor hat sie ein bisschen Angst?**
  - Accepted: Sie hat Angst vor dem Vorstellungsgespräch. / Vor dem Vorstellungsgespräch.
  - Hint 1: Suche „Angst vor“.
  - Hint 2: Das Objekt folgt direkt danach.
  - Feedback: Richtig: vor dem Vorstellungsgespräch.

## Test Kapitel 11
- **T1 — Ich warte ___ den Termin.**
  - Accepted: auf
  - Hint 1: warten ...
  - Hint 2: warten auf.
  - Feedback: Richtig: auf.
- **T2 — Wir nehmen ___ einem Kurs teil.**
  - Accepted: an
  - Hint 1: teilnehmen ...
  - Hint 2: teilnehmen an.
  - Feedback: Richtig: an.
- **T3 — Sie ist ___ ihrem Ergebnis zufrieden.**
  - Accepted: mit
  - Hint 1: zufrieden ...
  - Hint 2: zufrieden mit.
  - Feedback: Richtig: mit.
- **T4 — Er interessiert sich ___ Technik.**
  - Accepted: für
  - Hint 1: sich interessieren ...
  - Hint 2: sich interessieren für.
  - Feedback: Richtig: für.
- **T5 — Ich denke an das Problem. → Ich denke ___.**
  - Accepted: daran
  - Hint 1: Sache + an.
  - Hint 2: da + r + an.
  - Feedback: Richtig: daran.
- **T6 — Wir sprechen über die Reise. → ___ sprecht ihr?**
  - Accepted: Worüber
  - Hint 1: Sache + über.
  - Hint 2: wo + r + über.
  - Feedback: Richtig: Worüber.
- **T7 — ___ wen wartest du? – Auf meinen Bruder.**
  - Accepted: Auf
  - Hint 1: Person + warten auf.
  - Hint 2: Frage: Auf wen ...?
  - Feedback: Richtig: Auf.
- **T8 — Sie träumt ___ einer Weltreise.**
  - Accepted: von
  - Hint 1: träumen ...
  - Hint 2: träumen von.
  - Feedback: Richtig: von.
- **T9 — Was ist der Grund ___ die Änderung?**
  - Accepted: für
  - Hint 1: Nomenverbindung.
  - Hint 2: Grund für.
  - Feedback: Richtig: für.
- **T10 — Bilde aus den Bausteinen: ich / sich freuen / das Wochenende.**
  - Accepted: Ich freue mich auf das Wochenende.
  - Hint 1: Welche Präposition gehört zu „sich freuen“?
  - Hint 2: sich freuen auf + Akkusativ.
  - Feedback: Richtig: Ich freue mich auf das Wochenende.

## Claude Code / Codex prompt
```text
You are working inside the existing LangNation language-school website repository.

TASK
Implement the attached LangNation Homework Specification for Kapitel 11 — Feste Präpositionen using the reusable self-learning homework engine already established for Kapitel 09.

PRIMARY GOAL
Maximum learning output from the student with minimum teacher interaction.

FIRST
1. Inspect the existing repository and the current Homework implementation before changing anything.
2. Reuse the Kapitel 09 generic components/evaluators/progress system if they already exist.
3. Do not create a second homework engine and do not hard-code a separate page architecture for this chapter.
4. Preserve auth, enrollment, routes, database conventions and the LangNation dark navy/gold design.

SCOPE
- Implement all Übungen, the Lesetext interactive tasks, and the Test Kapitel 11.
- Speaking and Writing are out of scope.
- Use the exact revised prompts, accepted-answer variants, hints, feedback and documented digital adaptations from this specification.
- This specification currently defines 51 countable student tasks. The UI must still calculate totals dynamically from data.

COMMON STUDENT FLOW
instruction → solved example(s) → attempt → Hint 1 → Hint 2 → check → explanatory feedback → retry → completion card → review

PROGRESS
green = richtig
yellow = mit Hinweis
red = verbessern
gray = offen

SIDEBAR
Use short labels only:
Kapitel 11
Übung 1
Übung 2
...
Lesetext
Test Kapitel 11

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