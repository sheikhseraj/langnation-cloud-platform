# LangNation Homework & Self-Learning Engine
## Kapitel 13 — Konjunktionen und Konnektoren

> Source: `LangNation_Kapitel_13_Konjunktionen_und_Konnektoren.docx`. Speaking and Writing are excluded. This specification defines **39** countable tasks; the app must calculate totals dynamically.

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
- Die Quellen-Lösungsseite enthält keine Lösungen zu Übung 5; diese digitalen Zielantworten sind eine transparente Ableitung aus der Aufgabenstellung.
- Sprechen/Schreiben werden entfernt. Die offene Umformung bleibt kontrolliert auto-checkbar.
- Digital adaptation of the original individual sentence task.
- Digital adaptation of the original individual sentence task.

## Exercises
### Übung 1 – und, aber, oder, denn, sondern
- Type: `sentence_connector`
- Objective: Nebenordnende Konnektoren nach Bedeutung unterscheiden.
- Instruction: Verbinde die Sätze mit dem passenden Konnektor.
- Solved examples:
  - `Ich bin müde. Ich arbeite weiter.` → **Ich bin müde, aber ich arbeite weiter.** — Gegensatz → aber.
  - `Möchtest du Wasser? Möchtest du Saft?` → **Möchtest du Wasser oder Saft?** — Alternative → oder.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 1 | Ich bin müde. Ich lerne weiter. | Ich bin müde, aber ich lerne weiter. | Gegensatz zwischen müde und weiterlernen. | Gegensatz → aber. | Richtig. |
| 2 | Möchtest du Tee? Möchtest du Kaffee? | Möchtest du Tee oder Kaffee? | Alternative/Auswahl. | oder verbindet Alternativen. | Richtig. |
| 3 | Ich bleibe zu Hause. Ich bin krank. | Ich bleibe zu Hause, denn ich bin krank. | Zweiter Satz nennt den Grund. | denn = Begründung mit Hauptsatzwortstellung. | Richtig. |
| 4 | Er fährt nicht mit dem Auto. Er fährt mit dem Zug. | Er fährt nicht mit dem Auto, sondern mit dem Zug. | Korrektur nach Negation. | nicht ..., sondern ... | Richtig. |

### Übung 2 – Nebensatz bilden
- Type: `sentence_transform`
- Objective: Nebensätze mit weil, dass, als, obwohl und falls bilden; Verb ans Ende setzen.
- Instruction: Verbinde mit dem angegebenen Konnektor.
- Solved examples:
  - `Ich bleibe zu Hause. Ich bin krank. (weil)` → **Ich bleibe zu Hause, weil ich krank bin.** — weil → Verb am Ende.
  - `Es regnet. Wir gehen raus. (obwohl)` → **Obwohl es regnet, gehen wir raus.** — obwohl = Gegensatz; Nebensatzverb am Ende.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 5 | Ich lerne Deutsch. Ich möchte in Deutschland arbeiten. (weil) | Ich lerne Deutsch, weil ich in Deutschland arbeiten möchte. / Weil ich in Deutschland arbeiten möchte, lerne ich Deutsch. | Der zweite Gedanke ist der Grund. | weil-Nebensatz: Verb am Ende. | Beide Satzreihenfolgen akzeptieren. |
| 6 | Ich weiß. Der Kurs beginnt um neun Uhr. (dass) | Ich weiß, dass der Kurs um neun Uhr beginnt. | dass leitet den Inhalt von „ich weiß“ ein. | Im dass-Satz steht das finite Verb am Ende. | Richtig. |
| 7 | Ich war zehn Jahre alt. Wir zogen um. (als) | Als ich zehn Jahre alt war, zogen wir um. / Wir zogen um, als ich zehn Jahre alt war. | Einmaliges Ereignis in der Vergangenheit. | als-Nebensatz: Verb am Ende. | Beide Satzreihenfolgen akzeptieren. |
| 8 | Es regnet. Wir gehen spazieren. (obwohl) | Obwohl es regnet, gehen wir spazieren. / Wir gehen spazieren, obwohl es regnet. | Es gibt einen Gegensatz. | obwohl-Nebensatz: Verb am Ende. | Beide akzeptieren. |
| 9 | Ruf mich an. Du brauchst Hilfe. (falls) | Ruf mich an, falls du Hilfe brauchst. / Falls du Hilfe brauchst, ruf mich an. | falls = Bedingung. | Im Nebensatz: du Hilfe brauchst. | Beide akzeptieren. |

### Übung 3 – Satzstellung
- Type: `word_order`
- Objective: Verbposition in Nebensatz und Hauptsatz nach Konnektor korrekt ordnen.
- Instruction: Ordne die Wörter.
- Solved examples:
  - `weil / ich / heute / arbeiten / muss` → **weil ich heute arbeiten muss** — Nebensatz: Verbkomplex am Ende.
  - `deshalb / bleibe / ich / zu Hause` → **Deshalb bleibe ich zu Hause.** — Konnektor auf Position 1 → Verb direkt danach.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 10 | weil / morgen / ich / arbeiten / muss | weil ich morgen arbeiten muss | weil leitet Nebensatz ein. | Subjekt + Mittelfeld + Verbkomplex am Ende. | Richtig. |
| 11 | deshalb / heute / bleibe / ich / zu Hause | Deshalb bleibe ich heute zu Hause. | deshalb kann Position 1 besetzen. | Danach kommt das finite Verb. | Richtig. |
| 12 | obwohl / müde / ist / sie / weiter / arbeitet / sie | Obwohl sie müde ist, arbeitet sie weiter. | obwohl-Nebensatz zuerst. | Verb am Ende des Nebensatzes; danach Hauptsatz Verb auf Position 1 nach Komma. | Richtig. |
| 13 | wenn / Zeit / habe / ich / komme / ich | Wenn ich Zeit habe, komme ich. | wenn-Nebensatz zuerst. | habe am Ende des Nebensatzes; komme direkt nach Komma. | Richtig. |

**UI note:** Als Drag-and-drop Wort-/Satzsegment-Builder umsetzen; Großschreibung und Komma nach erfolgreicher Ordnung automatisch erklären.

### Übung 4 – wenn oder als?
- Type: `fill_blank`
- Objective: wenn für Wiederholung/Gegenwart/Zukunft und als für einmalige Vergangenheit unterscheiden.
- Instruction: Setze wenn oder als ein.
- Solved examples:
  - `___ ich gestern nach Hause kam, regnete es.` → **Als** — einmalige Vergangenheit → als.
  - `Immer ___ ich Urlaub habe, reise ich.` → **wenn** — wiederholt → wenn.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 14 | ___ ich gestern nach Hause kam, war niemand da. | Als | Einmalige Vergangenheit. | als. | Richtig: Als. |
| 15 | ___ ich Zeit habe, lese ich. | Wenn | Allgemein/wiederholt. | wenn. | Richtig: Wenn. |
| 16 | Immer ___ wir Ferien hatten, besuchten wir unsere Großeltern. | wenn | „Immer“ signalisiert Wiederholung. | Wiederholte Vergangenheit → wenn. | Richtig: wenn. |
| 17 | ___ er 18 war, machte er den Führerschein. | Als | Ein einmaliger Lebenszeitpunkt. | Einmalige Vergangenheit → als. | Richtig: Als. |

### Übung 5 – Ursache und Folge
- Type: `paired_sentence_transform`
- Objective: Ursache/Folge einmal mit weil-Nebensatz und einmal mit deshalb-Hauptsatz ausdrücken.
- Instruction: Formuliere zu jedem Paar zwei Varianten: eine mit weil, eine mit deshalb.
- Solved examples:
  - `Ich bin müde. Ich gehe früh schlafen.` → **weil: Ich gehe früh schlafen, weil ich müde bin. | deshalb: Ich bin müde. Deshalb gehe ich früh schlafen.** — weil nennt Ursache im Nebensatz; deshalb leitet die Folge ein.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 18 | Ich bin krank. Ich bleibe zu Hause. | Ich bleibe zu Hause, weil ich krank bin.\|Ich bin krank. Deshalb bleibe ich zu Hause. / Weil ich krank bin, bleibe ich zu Hause.\|Ich bin krank. Deshalb bleibe ich zu Hause. | Welche Aussage ist Ursache? | krank = Ursache; zu Hause bleiben = Folge. | Beide Felder müssen korrekt sein. |
| 19 | Der Zug hat Verspätung. Wir kommen später. | Wir kommen später, weil der Zug Verspätung hat.\|Der Zug hat Verspätung. Deshalb kommen wir später. / Weil der Zug Verspätung hat, kommen wir später.\|Der Zug hat Verspätung. Deshalb kommen wir später. | Verspätung ist die Ursache. | weil → Verb am Ende; deshalb → Verb direkt danach. | Beide Varianten prüfen. |
| 20 | Ich möchte die Prüfung bestehen. Ich lerne jeden Tag. | Ich lerne jeden Tag, weil ich die Prüfung bestehen möchte.\|Ich möchte die Prüfung bestehen. Deshalb lerne ich jeden Tag. / Weil ich die Prüfung bestehen möchte, lerne ich jeden Tag.\|Ich möchte die Prüfung bestehen. Deshalb lerne ich jeden Tag. | Warum lerne ich jeden Tag? | Ziel/Wunsch ist der Grund. | Beide Varianten korrekt. |

### Übung 6 – Doppelkonnektoren
- Type: `linked_blanks`
- Objective: Doppelkonnektoren als feste Paare erkennen und korrekt einsetzen.
- Instruction: Ergänze beide Teile.
- Solved examples:
  - `Ich trinke ___ Tee ___ Kaffee.` → **sowohl | als auch** — sowohl ... als auch.
  - `Wir fahren ___ mit dem Bus ___ mit der Bahn.` → **entweder | oder** — Alternative.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 21 | Ich spreche ___ Deutsch ___ Englisch. | sowohl\|als auch | Beide Sprachen werden eingeschlossen. | sowohl ... als auch. | Richtig. |
| 22 | Wir fahren ___ mit dem Zug ___ mit dem Auto. | entweder\|oder | Zwei Alternativen. | entweder ... oder. | Richtig. |
| 23 | Der Job ist ___ interessant, ___ anstrengend. | zwar\|aber | Zugeständnis + Gegensatz. | zwar ... aber. | Richtig. |
| 24 | Er ist ___ freundlich, ___ hilfsbereit. | nicht nur\|sondern auch | Zweite Eigenschaft kommt zusätzlich dazu. | nicht nur ... sondern auch. | Richtig. |
| 25 | ___ mehr ich übe, ___ besser spreche ich. | Je\|desto | Proportionale Entwicklung. | je ... desto. | Richtig. |

## Lesetext
### Lesetext – Lernen neben der Arbeit
Nora arbeitet Vollzeit, aber sie besucht zusätzlich einen Deutschkurs. Sie lernt jeden Abend, weil sie die B1-Prüfung bestehen möchte. Obwohl sie oft müde ist, macht sie ihre Übungen regelmäßig. Wenn sie eine neue Grammatikregel nicht versteht, fragt sie ihre Lehrerin. Der Kurs ist zwar anstrengend, aber Nora findet ihn sehr hilfreich. Sie übt nicht nur Grammatik, sondern auch Sprechen und Schreiben. Je mehr sie Deutsch benutzt, desto sicherer wird sie. Am Wochenende wiederholt sie den Stoff; danach trifft sie meistens ihre Freunde.

- **R1 — Markiere alle Konnektoren/Konnektorpaare im Text.**
  - Accepted: aber / weil / Obwohl / Wenn / zwar ... aber / nicht nur ... sondern auch / Je ... desto / danach
  - Hint 1: Suche Wörter, die Sätze/Teile verbinden oder Beziehungen ausdrücken.
  - Hint 2: Achte auf mehrteilige Paare.
  - Feedback: Positionsbasierte Markierung; Doppelkonnektoren als Gruppe behandeln.
- **R2 — Welche Konnektoren im Text leiten einen Nebensatz ein?**
  - Accepted: weil / obwohl / wenn
  - Hint 1: Bei welchen steht das Verb im eingeleiteten Satz am Ende?
  - Hint 2: weil / obwohl / wenn.
  - Feedback: Richtig.
- **R3 — Finde einen Doppelkonnektor.**
  - Accepted: zwar ... aber / nicht nur ... sondern auch / je ... desto
  - Hint 1: Ein Doppelkonnektor besteht aus zwei zusammengehörigen Teilen.
  - Hint 2: Im Text stehen sogar drei verschiedene.
  - Feedback: Jede der drei Antworten akzeptieren.
- **R4 — Formuliere den weil-Satz mit deshalb um.**
  - Accepted: Sie möchte die B1-Prüfung bestehen. Deshalb lernt sie jeden Abend. / Sie möchte die B1-Prüfung bestehen; deshalb lernt sie jeden Abend.
  - Hint 1: Zuerst Ursache, dann Folge.
  - Hint 2: deshalb steht im zweiten Hauptsatz und wird vom Verb gefolgt.
  - Feedback: Richtig.

## Mini-Test – Kapitel 13
- **T1 — Verbinde mit weil: Ich bleibe zu Hause. Ich bin krank.**
  - Accepted: Ich bleibe zu Hause, weil ich krank bin. / Weil ich krank bin, bleibe ich zu Hause.
  - Hint 1: krank = Ursache.
  - Hint 2: weil-Nebensatz Verb am Ende.
  - Feedback: Richtig.
- **T2 — Verbinde mit deshalb: Ich bin krank. Ich bleibe zu Hause.**
  - Accepted: Ich bin krank. Deshalb bleibe ich zu Hause. / Ich bin krank; deshalb bleibe ich zu Hause.
  - Hint 1: Zuerst Ursache, dann Folge.
  - Hint 2: Nach deshalb steht das Verb direkt.
  - Feedback: Richtig.
- **T3 — Ich weiß nicht, ___ er heute kommt.**
  - Accepted: ob
  - Hint 1: Indirekte Ja/Nein-Frage.
  - Hint 2: ob.
  - Feedback: Richtig: ob.
- **T4 — ___ ich klein war, wohnte ich in Berlin.**
  - Accepted: Als
  - Hint 1: Einmaliger Zeitraum in der Vergangenheit.
  - Hint 2: als.
  - Feedback: Richtig: Als.
- **T5 — Korrigiere: „Obwohl ich müde bin, aber ich lerne.“**
  - Accepted: Obwohl ich müde bin, lerne ich.
  - Hint 1: obwohl reicht als Gegensatzkonnektor.
  - Hint 2: Kein zusätzliches aber im Hauptsatz.
  - Feedback: Richtig.
- **T6 — entweder … ___**
  - Accepted: oder
  - Hint 1: Festes Paar.
  - Hint 2: entweder ... oder.
  - Feedback: Richtig: oder.
- **T7 — nicht nur … ___ auch**
  - Accepted: sondern
  - Hint 1: Festes Paar.
  - Hint 2: nicht nur ... sondern auch.
  - Feedback: Richtig: sondern.
- **T8 — Geführter Satz mit „trotzdem“: Es regnet. Ich gehe spazieren.**
  - Accepted: Es regnet. Trotzdem gehe ich spazieren. / Es regnet; trotzdem gehe ich spazieren.
  - Hint 1: trotzdem leitet eine gegensätzliche Folge ein.
  - Hint 2: Nach trotzdem steht das Verb direkt.
  - Feedback: Richtig.
- **T9 — Geführter Satz mit „je … desto“: Ich übe mehr. Ich spreche besser.**
  - Accepted: Je mehr ich übe, desto besser spreche ich.
  - Hint 1: Je-Teil zuerst, desto-Teil danach.
  - Hint 2: Verbposition wie im Muster.
  - Feedback: Richtig.
- **T10 — Wähle die richtige Erklärung zu denn und weil.**
  - Accepted: denn + Hauptsatzwortstellung; weil + Nebensatz mit Verb am Ende.
  - Hint 1: Beide können einen Grund ausdrücken.
  - Hint 2: Der Unterschied liegt besonders in der Wortstellung.
  - Feedback: Richtig.

## Claude Code / Codex prompt
```text
You are working inside the existing LangNation language-school website repository.

TASK
Implement the attached LangNation Homework Specification for Kapitel 13 — Konjunktionen und Konnektoren using the reusable self-learning homework engine already established for Kapitel 09.

PRIMARY GOAL
Maximum learning output from the student with minimum teacher interaction.

FIRST
1. Inspect the existing repository and the current Homework implementation before changing anything.
2. Reuse the Kapitel 09 generic components/evaluators/progress system if they already exist.
3. Do not create a second homework engine and do not hard-code a separate page architecture for this chapter.
4. Preserve auth, enrollment, routes, database conventions and the LangNation dark navy/gold design.

SCOPE
- Implement all Übungen, the Lesetext interactive tasks, and the Mini-Test – Kapitel 13.
- Speaking and Writing are out of scope.
- Use the exact revised prompts, accepted-answer variants, hints, feedback and documented digital adaptations from this specification.
- This specification currently defines 39 countable student tasks. The UI must still calculate totals dynamically from data.

COMMON STUDENT FLOW
instruction → solved example(s) → attempt → Hint 1 → Hint 2 → check → explanatory feedback → retry → completion card → review

PROGRESS
green = richtig
yellow = mit Hinweis
red = verbessern
gray = offen

SIDEBAR
Use short labels only:
Kapitel 13
Übung 1
Übung 2
...
Lesetext
Mini-Test – Kapitel 13

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