# LangNation Homework & Self-Learning Engine
## Kapitel 12 — Zeitformen

> Source: `LangNation_Kapitel_12_Zeitformen.docx`. Speaking and Writing are excluded. This specification defines **48** countable tasks; the app must calculate totals dynamically.

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
- Die Lösungsseite der Quelle enthält keine Lösungen zu Übung 1. Die digitalen Zielantworten sind deshalb als transparente didaktische Ableitung aus der Aufgabenstellung gekennzeichnet.
- Sprechen/Schreiben werden entfernt. Die Erklärfrage zum Plusquamperfekt wird als kontrollierte Konzeptauswahl umgesetzt.
- Digital adaptation of the source short-answer justification into a concept-choice item.
- Digital adaptation of the original free two-sentence task.

## Exercises
### Übung 1 – Präsens oder Zukunft?
- Type: `sentence_builder_choice`
- Objective: Präsens mit Zukunftsbedeutung und Futur I situationsgerecht verwenden.
- Instruction: Formuliere die Sätze sinnvoll. Präsens und Futur I können je nach Kontext beide korrekt sein; die UI zeigt eine bevorzugte natürliche Variante.
- Solved examples:
  - `ich / morgen / arbeiten` → **Ich arbeite morgen.** — Konkreter Plan → Präsens ist sehr häufig.
  - `er / wahrscheinlich / später / anrufen` → **Er wird wahrscheinlich später anrufen.** — Vermutung → Futur I passt gut.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 1 | Ich / morgen / nach Hamburg fahren | Ich fahre morgen nach Hamburg. / Morgen fahre ich nach Hamburg. / Ich werde morgen nach Hamburg fahren. / Morgen werde ich nach Hamburg fahren. | Geht es um einen konkreten Plan oder eine Prognose? | Bei einem konkreten Plan ist Präsens sehr natürlich. | Alle vier Varianten akzeptieren; bevorzugtes Feedback: Präsens für konkrete Planung. |
| 2 | Wir / nächste Woche / einen Test schreiben | Wir schreiben nächste Woche einen Test. / Nächste Woche schreiben wir einen Test. / Wir werden nächste Woche einen Test schreiben. / Nächste Woche werden wir einen Test schreiben. | Ein konkreter Termin kann im Präsens stehen. | Futur I ist ebenfalls grammatisch möglich. | Beide Zeitformen akzeptieren; Präsens als natürliche Plan-Variante hervorheben. |
| 3 | Er / wahrscheinlich / später anrufen | Er wird wahrscheinlich später anrufen. / Wahrscheinlich wird er später anrufen. / Er ruft wahrscheinlich später an. / Wahrscheinlich ruft er später an. | „wahrscheinlich“ signalisiert eine Vermutung. | Futur I kann Vermutung/Zukunft ausdrücken. | Beide korrekt; Futur I als besonders passende Zielvariante. |
| 4 | Heute / ich / zu Hause arbeiten | Heute arbeite ich zu Hause. / Ich arbeite heute zu Hause. / Heute werde ich zu Hause arbeiten. / Ich werde heute zu Hause arbeiten. | Der Zeitpunkt „heute“ ist klar. | Präsens ist im Alltag sehr natürlich. | Beide akzeptieren; Präsens bevorzugt. |

### Übung 2 – Partizip II
- Type: `fill_blank`
- Objective: Partizip II regelmäßiger, unregelmäßiger, trennbarer und -ieren-Verben bilden.
- Instruction: Bilde das Partizip II.
- Solved examples:
  - `lernen` → **gelernt** — regelmäßig: ge- + Stamm + -t.
  - `telefonieren` → **telefoniert** — Verben auf -ieren ohne ge-.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 5 | machen | gemacht | Regelmäßiges Verb. | ge + mach + t. | Richtig: gemacht. |
| 6 | fahren | gefahren | Unregelmäßiges Verb. | Partizip II lernen: gefahren. | Richtig: gefahren. |
| 7 | einkaufen | eingekauft | Trennbares Verb. | ge steht zwischen Präfix und Stamm: ein-ge-kauft. | Richtig: eingekauft. |
| 8 | besuchen | besucht | Untrennbares Präfix be-. | Kein ge-. | Richtig: besucht. |
| 9 | studieren | studiert | Verb auf -ieren. | Kein ge-. | Richtig: studiert. |
| 10 | sehen | gesehen | Unregelmäßig. | sehen → gesehen. | Richtig: gesehen. |
| 11 | arbeiten | gearbeitet | Stamm endet auf t. | -et im Partizip: gearbeitet. | Richtig. |
| 12 | anrufen | angerufen | Trennbares Verb. | an-ge-rufen. | Richtig: angerufen. |

### Übung 3 – haben oder sein?
- Type: `fill_blank`
- Objective: Passendes Hilfsverb im Perfekt auswählen und konjugieren.
- Instruction: Setze die richtige Form von haben oder sein ein.
- Solved examples:
  - `Ich ___ viel gelernt.` → **habe** — lernen → haben.
  - `Wir ___ nach Hause gegangen.` → **sind** — Ortsveränderung gehen → sein.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 13 | Ich ___ gestern lange gearbeitet. | habe | arbeiten bildet Perfekt mit haben. | Subjekt ich → habe. | Richtig: habe. |
| 14 | Wir ___ nach Leipzig gefahren. | sind | fahren als Ortsveränderung → sein. | wir → sind. | Richtig: sind. |
| 15 | Sie ___ früh aufgestanden. | ist | aufstehen → Zustands-/Ortswechsel → sein. | sie Singular → ist. | Richtig: ist. |
| 16 | Er ___ einen Film gesehen. | hat | sehen → haben. | er → hat. | Richtig: hat. |
| 17 | Ihr ___ viel gelernt. | habt | lernen → haben. | ihr → habt. | Richtig: habt. |
| 18 | Das Kind ___ eingeschlafen. | ist | einschlafen = Zustandswechsel → sein. | das Kind → ist. | Richtig: ist. |

### Übung 4 – Perfekt bilden
- Type: `sentence_transform`
- Objective: Präsenssätze korrekt ins Perfekt setzen.
- Instruction: Setze die Sätze ins Perfekt.
- Solved examples:
  - `Ich lerne Deutsch.` → **Ich habe Deutsch gelernt.** — haben + Partizip II.
  - `Sie geht nach Hause.` → **Sie ist nach Hause gegangen.** — sein bei gehen.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 19 | Ich kaufe Lebensmittel. | Ich habe Lebensmittel gekauft. | kaufen → gekauft; Hilfsverb haben. | ich → habe. | Richtig. |
| 20 | Sie fährt nach Berlin. | Sie ist nach Berlin gefahren. | fahren mit Ziel → sein. | sie → ist. | Richtig. |
| 21 | Wir besuchen unsere Freunde. | Wir haben unsere Freunde besucht. | besuchen → besucht; haben. | wir → haben. | Richtig. |
| 22 | Er ruft seine Mutter an. | Er hat seine Mutter angerufen. | anrufen → angerufen; haben. | er → hat. | Richtig. |
| 23 | Ihr lernt für die Prüfung. | Ihr habt für die Prüfung gelernt. | lernen → gelernt; haben. | ihr → habt. | Richtig. |

### Übung 5 – Präteritum
- Type: `fill_blank`
- Objective: Häufige Präteritumformen von sein, haben, Modalverben und gehen verwenden.
- Instruction: Setze die passende Präteritumform ein.
- Solved examples:
  - `Gestern ___ ich zu Hause. (sein)` → **war** — sein → war.
  - `Wir ___ arbeiten. (müssen)` → **mussten** — müssen → mussten.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 24 | Gestern ___ ich müde. (sein) | war | sein im Präteritum. | ich → war. | Richtig: war. |
| 25 | Wir ___ keine Zeit. (haben) | hatten | haben im Präteritum. | wir → hatten. | Richtig: hatten. |
| 26 | Er ___ nicht kommen. (können) | konnte | können im Präteritum. | er → konnte. | Richtig: konnte. |
| 27 | Ich ___ früh aufstehen. (müssen) | musste | müssen im Präteritum. | ich → musste. | Richtig: musste. |
| 28 | Sie ___ nach Hause. (gehen) | ging | gehen → ging. | Subjekt sie Singular. | Richtig: ging. |

### Übung 6 – Zeitform erkennen
- Type: `choice`
- Objective: Präsens, Perfekt, Präteritum, Futur I und Plusquamperfekt unterscheiden.
- Instruction: Bestimme die Zeitform.
- Solved examples:
  - `Ich habe gearbeitet.` → **Perfekt** — haben + Partizip II.
  - `Wir werden umziehen.` → **Futur I** — werden + Infinitiv.

| ID | Prompt | Accepted answers | Hint 1 | Hint 2 | Feedback |
|---|---|---|---|---|---|
| 29 | Ich habe gestern gearbeitet. | Perfekt | Hilfsverb im Präsens + Partizip II. | habe gearbeitet = Perfekt. | Richtig: Perfekt. |
| 30 | Morgen fahre ich nach Berlin. | Präsens mit Zukunftsbedeutung | Verb steht im Präsens, Zeitangabe zeigt Zukunft. | Nicht jedes zukünftige Ereignis braucht Futur I. | Richtig. |
| 31 | Er war sehr müde. | Präteritum | war ist Präteritum von sein. | Einfaches Vergangenheitstempus. | Richtig: Präteritum. |
| 32 | Wir werden bald umziehen. | Futur I | werden + Infinitiv. | werden ... umziehen. | Richtig: Futur I. |
| 33 | Sie hatte schon gegessen. | Plusquamperfekt | hatte + Partizip II. | Vorvergangenheit. | Richtig: Plusquamperfekt. |

## Lesetext
### Lesetext – Ein anstrengender Montag
Gestern war mein Montag besonders lang. Ich bin um sechs Uhr aufgestanden und habe schnell gefrühstückt. Danach bin ich mit dem Zug zur Arbeit gefahren. Als ich im Büro ankam, hatte meine Kollegin die erste Besprechung schon vorbereitet. Wir haben den ganzen Vormittag an einem Projekt gearbeitet. Am Nachmittag musste ich noch einen Termin wahrnehmen. Heute bin ich wieder etwas entspannter. Morgen arbeite ich von zu Hause, und am Abend werde ich endlich meine Freunde treffen.

- **R1 — Markiere die Verbformen und ordne sie der Zeitform zu.**
  - Accepted: war=Präteritum / bin ... aufgestanden=Perfekt / habe ... gefrühstückt=Perfekt / bin ... gefahren=Perfekt / ankam=Präteritum / hatte ... vorbereitet=Plusquamperfekt / haben ... gearbeitet=Perfekt / musste ... wahrnehmen=Präteritum / bin=Präsens / arbeite=Präsens mit Zukunftsbedeutung / werde ... treffen=Futur I
  - Hint 1: Suche finite Verben und mehrteilige Verbformen.
  - Hint 2: Bei Perfekt/Plusquamperfekt/Futur gehören Hilfsverb und Partizip/Infinitiv zusammen.
  - Feedback: 11 Zielverbformen/-gruppen.
- **R2 — Was ist zuerst passiert: die Vorbereitung der Besprechung oder die Ankunft im Büro?**
  - Accepted: Die Vorbereitung der Besprechung. / Die Kollegin hatte die Besprechung vor der Ankunft vorbereitet.
  - Hint 1: „hatte vorbereitet“ steht vor einem anderen vergangenen Ereignis.
  - Hint 2: Plusquamperfekt zeigt die frühere Vergangenheit.
  - Feedback: Richtig: Die Vorbereitung war zuerst.
- **R3 — Warum steht „hatte vorbereitet“ im Plusquamperfekt?**
  - Accepted: Weil die Vorbereitung vor einem anderen Ereignis in der Vergangenheit passiert war. / Weil die Vorbereitung schon vor der Ankunft im Büro abgeschlossen war.
  - Hint 1: Vergleiche Vorbereitung und Ankunft.
  - Hint 2: Plusquamperfekt = Vorvergangenheit.
  - Feedback: Inhaltlich äquivalente kontrollierte Erklärung akzeptieren.
- **R4 — Finde das Beispiel für Zukunft im Präsens.**
  - Accepted: Morgen arbeite ich von zu Hause. / arbeite
  - Hint 1: Suche eine Zukunftszeitangabe ohne „werden“.
  - Hint 2: „Morgen“ + Präsens.
  - Feedback: Richtig: Morgen arbeite ich von zu Hause.
- **R5 — Finde das Beispiel für Futur I.**
  - Accepted: Am Abend werde ich endlich meine Freunde treffen. / werde ... treffen
  - Hint 1: Suche „werden + Infinitiv“.
  - Hint 2: werde ... treffen.
  - Feedback: Richtig.

## Test – Kapitel 12
- **T1 — Bilde das Partizip II von „anrufen“.**
  - Accepted: angerufen
  - Hint 1: Trennbares Verb.
  - Hint 2: an-ge-rufen.
  - Feedback: Richtig.
- **T2 — Ich ___ nach Köln gefahren. (sein/haben)**
  - Accepted: bin
  - Hint 1: fahren mit Ziel → sein.
  - Hint 2: ich → bin.
  - Feedback: Richtig.
- **T3 — Setze ins Perfekt: Wir lernen viel.**
  - Accepted: Wir haben viel gelernt.
  - Hint 1: lernen → gelernt; haben.
  - Hint 2: wir → haben.
  - Feedback: Richtig.
- **T4 — Setze ins Präteritum: Ich bin müde.**
  - Accepted: Ich war müde.
  - Hint 1: sein → war.
  - Hint 2: ich → war.
  - Feedback: Richtig.
- **T5 — Setze ins Präteritum: Er muss arbeiten.**
  - Accepted: Er musste arbeiten.
  - Hint 1: müssen → musste.
  - Hint 2: er → musste.
  - Feedback: Richtig.
- **T6 — Bilde Futur I: Ich / morgen / anrufen.**
  - Accepted: Ich werde morgen anrufen. / Morgen werde ich anrufen.
  - Hint 1: Futur I = werden + Infinitiv.
  - Hint 2: ich → werde; anrufen am Ende.
  - Feedback: Beide Wortstellungen akzeptieren.
- **T7 — Welche Aussage ist richtig?**
  - Accepted: Beide sind korrekt; bei einem konkreten Plan ist „Morgen fahre ich …“ im Alltag sehr häufig.
  - Hint 1: Präsens kann mit Zukunftszeitangabe Zukunft ausdrücken.
  - Hint 2: Futur I ist nicht immer nötig.
  - Feedback: Richtig: beide korrekt; Präsens ist für konkrete Pläne sehr häufig.
- **T8 — Korrigiere: „Ich habe nach Berlin gefahren.“**
  - Accepted: Ich bin nach Berlin gefahren.
  - Hint 1: fahren mit Ziel bildet Perfekt mit sein.
  - Hint 2: ich → bin.
  - Feedback: Richtig.
- **T9a — Geführter Perfekt-Satz: ich / gestern / arbeiten.**
  - Accepted: Ich habe gestern gearbeitet. / Gestern habe ich gearbeitet.
  - Hint 1: Perfekt von arbeiten.
  - Hint 2: haben + gearbeitet.
  - Feedback: Richtig.
- **T9b — Geführter Futur-I-Satz: ich / morgen / arbeiten.**
  - Accepted: Ich werde morgen arbeiten. / Morgen werde ich arbeiten.
  - Hint 1: Futur I bilden.
  - Hint 2: werden + Infinitiv.
  - Feedback: Richtig.

## Claude Code / Codex prompt
```text
You are working inside the existing LangNation language-school website repository.

TASK
Implement the attached LangNation Homework Specification for Kapitel 12 — Zeitformen using the reusable self-learning homework engine already established for Kapitel 09.

PRIMARY GOAL
Maximum learning output from the student with minimum teacher interaction.

FIRST
1. Inspect the existing repository and the current Homework implementation before changing anything.
2. Reuse the Kapitel 09 generic components/evaluators/progress system if they already exist.
3. Do not create a second homework engine and do not hard-code a separate page architecture for this chapter.
4. Preserve auth, enrollment, routes, database conventions and the LangNation dark navy/gold design.

SCOPE
- Implement all Übungen, the Lesetext interactive tasks, and the Test – Kapitel 12.
- Speaking and Writing are out of scope.
- Use the exact revised prompts, accepted-answer variants, hints, feedback and documented digital adaptations from this specification.
- This specification currently defines 48 countable student tasks. The UI must still calculate totals dynamically from data.

COMMON STUDENT FLOW
instruction → solved example(s) → attempt → Hint 1 → Hint 2 → check → explanatory feedback → retry → completion card → review

PROGRESS
green = richtig
yellow = mit Hinweis
red = verbessern
gray = offen

SIDEBAR
Use short labels only:
Kapitel 12
Übung 1
Übung 2
...
Lesetext
Test – Kapitel 12

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