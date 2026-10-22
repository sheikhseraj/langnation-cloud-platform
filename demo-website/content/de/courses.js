// German course text.
//
// Applied to the lang='de' rows in MySQL by tools/apply-de-courses.js.
// Those rows were seeded with the English text by the migration, because
// there was nothing else to seed them with; this replaces it and sets
// translated = 1, which removes the "shown in English" notice.
//
// Once applied, the database is the source of truth and this file is a
// record of what was written — edit German in /rootadmin, not here.
//
// Only the fields present are written, so a course can be translated
// field by field and the script re-run as often as needed.
//
// Conventions kept consistent across every course, because these headings
// repeat and inconsistency between them looks careless:
//
//   At a Glance          → Auf einen Blick
//   Course Contents      → Kursinhalte
//   Training Methodology → Methodik
//   Materials Included   → Enthaltene Materialien
//   Placement Test       → Einstufungstest
//   Exam Pattern         → Prüfungsformat
//
// Grammar terms in the curriculum lists were already German in the source
// and are left as they are. A few typos in the English ("ourse Contents",
// "Seprable", "Advance" for Advanced) are simply corrected here rather
// than faithfully reproduced.

const TECH = `<h3>Technische Voraussetzungen für den Online-Kurs</h3><ul><li>PC, Laptop oder Tablet</li><li>Headset mit Mikrofon</li><li>Stabile Internetverbindung</li><li>E-Mail-Adresse</li><li>Betriebssystem: Windows, macOS, Android, iOS</li><li>Browser: aktuelle Version von Google Chrome (für alle Betriebssysteme)</li></ul>`;

const METHOD = `<h3>Methodik</h3><ul><li>Selbststudium mit digitalem Material</li><li>Live-Sitzungen in der Gruppe</li><li>Unterricht durch unsere LangNation-Lehrkräfte</li><li>Audio- und Videounterstützung</li><li>Kombination aus Präsenz- und Online-Unterricht</li><li>Diskussionen im Unterricht und in der Gruppe</li><li>Einzel- und Gruppenaufgaben</li></ul>`;

// The classroom rules and the copyright note are identical on every
// Regular course, so they are written once. The source HTML carried
// corrupted attributes from the old editor (yackocpvbhs="" and similar
// paste artefacts) and empty spacer paragraphs; both are dropped here
// rather than translated.
const CLASSROOM = `<h3>Unterrichtsregeln und Erwartungen</h3><div class="table-scroll"><table><tbody><tr><td><b>Pünktlichkeit</b></td><td><b>Vorbereitung</b></td></tr><tr><td><ul><li>Kommen Sie pünktlich in den Unterricht. Wenn Sie nicht teilnehmen können, sagen Sie Ihrer Lehrkraft rechtzeitig Bescheid.</li></ul></td><td><ul><li>Bringen Sie alle nötigen Materialien mit (Heft, Stift, Kopfhörer und Ihre Aufgaben).</li></ul></td></tr><tr><td><b>Aktive Teilnahme</b></td><td><b>Mikrofon stummschalten</b></td></tr><tr><td><ul><li>Beteiligen Sie sich an Übungen und Diskussionen. Sprechen Sie mit, stellen Sie Fragen, bringen Sie sich in die Gruppenarbeit ein.</li></ul></td><td><ul><li>Schalten Sie Ihr Mikrofon stumm, wenn Sie nicht sprechen, damit keine Nebengeräusche stören.</li></ul></td></tr><tr><td><b>Kamera an, wenn möglich</b></td><td><b>Konzentriert bleiben</b></td></tr><tr><td><ul><li>Lassen Sie die Kamera an. Das hilft der Konzentration und macht den Unterricht lebendiger.</li></ul></td><td><ul><li>Vermeiden Sie Ablenkungen während des Unterrichts, etwa Surfen im Internet oder soziale Medien.</li></ul></td></tr><tr><td><b>Respekt und Höflichkeit</b></td><td><b>Einsatz und Engagement</b></td></tr><tr><td><ul><li>Begegnen Sie Ihrer Lehrkraft und Ihren Mitlernenden stets freundlich und respektvoll. Hören Sie zu, wenn andere sprechen, und lassen Sie alle zu Wort kommen.</li></ul></td><td><ul><li>Geben Sie bei jeder Aufgabe Ihr Bestes, ob Sprechen, Schreiben oder Hören. Arbeiten Sie daran, besser zu werden – und helfen Sie anderen dabei.</li></ul></td></tr><tr><td><b>Fragen Sie nach, wenn Sie etwas brauchen</b></td><td><b>Sprachgebrauch</b></td></tr><tr><td><ul><li>Wenn Sie etwas nicht verstehen, fragen Sie. Wir sind da, um Sie bei jedem Schritt zu unterstützen.</li></ul></td><td><ul><li>Sprechen Sie im Unterricht so viel Deutsch wie möglich. Fehler sind kein Problem – Üben ist der Weg zum Fortschritt.</li></ul></td></tr></tbody></table></div>`;

const COPYRIGHT = `<h3>Urheberrecht und Plagiate</h3><p>Von allen Teilnehmenden wird erwartet, dass sie geistiges Eigentum achten, Quellen korrekt angeben und Plagiate vermeiden. Das Übernehmen fremder Arbeit ohne Quellenangabe verstößt gegen die wissenschaftliche Redlichkeit und hat entsprechende Folgen.</p>`;

const WELCOME = `<h3>Willkommen beim Sprachinstitut LangNation</h3><p>LangNation ist Ihre Adresse, wenn Sie Deutsch wirklich lernen wollen. Unsere zertifizierten Online-Kurse richten sich an Anfängerinnen und Anfänger ebenso wie an Fortgeschrittene, mit flexiblen Zeiten und fachkundiger Begleitung. Weil bei uns die Kommunikation im Alltag und das kulturelle Verständnis im Mittelpunkt stehen, bekommen Sie das Rüstzeug für Studium, Beruf und Privatleben. Beginnen Sie noch heute Ihren Weg zum fließenden Deutsch.</p>`;

// The Regular courses share an identical description apart from the level
// named in the two quotations, so it is built rather than repeated. The
// source had each activity in its own single-item list separated by empty
// paragraphs; one list is the same thing without the debris.
const GLANCE = `<h4>Auf einen Blick</h4><ul><li>Flexible Zeiten, von überall aus</li><li>Individuelle Betreuung durch Ihre Lehrkraft</li><li>Abwechslungsreiche Übungen</li><li>Interessante und aktuelle Themen</li><li>Kostenloser Online-Einstufungstest</li><li>Maximale Teilnehmerzahl: 6 bis 8</li></ul><h4>So arbeiten wir im Unterricht</h4><ul><li><b>Rollenspiele und Simulationen:</b> Gespräche aus Alltag und Beruf realistisch üben.</li><li><b>Gruppendiskussionen:</b> Sicherheit und Flüssigkeit im gemeinsamen Gespräch über verschiedene Themen aufbauen.</li><li><b>Interaktive Grammatik- und Wortschatzübungen:</b> Das Fundament festigen, mit Übungen, die Freude machen.</li><li><b>Kulturelle Werkstätten:</b> Einblicke in deutsche Kultur, Traditionen und Umgangsformen.</li><li><b>Hör- und Sprechübungen:</b> Aussprache und Verständnis gezielt verbessern.</li></ul><p><img src="/img/content/b7e437bbd4ac.webp" alt="" loading="lazy" decoding="async"></p>`;

const describe = (level, cefr) =>
  `${WELCOME}<blockquote>Das Zertifikat Deutsch ${level} wird von der Deutschen Botschaft als Nachweis entsprechender Kenntnisse der deutschen Sprache anerkannt. Damit können Sie ein Visum zum Ehegattennachzug beantragen.</blockquote><blockquote>${cefr}</blockquote>${GLANCE}`;

const EXTRA = (level) =>
  `<h3>Materialien und Methodik</h3><div class="table-scroll"><table><tbody><tr><td>Kurs- und Arbeitsbuch</td><td>LangNation-Skripte</td><td>Deutsche Geschichten</td><td>Übungsprüfungen</td></tr><tr><td>Live-Sitzungen</td><td>Einzelaufgaben</td><td>Prüfungsvorbereitung</td><td>Quiz</td></tr></tbody></table></div><h3>Zusätzlich</h3><ul><li>Vorbereitung auf die ${level}-Prüfung</li><li>Sprechen zu verschiedenen Situationen</li><li>Quiz</li></ul>`;

const CERT = (level) =>
  `<p><b>Leistungsnachweis und Zertifikat:</b></p><ul><li>Übungen und Tests, um den Fortschritt zu verfolgen</li><li>Abschlussprüfung für das Zertifikat auf Niveau ${level}</li></ul>`;

const exam = (level) =>
  `<p>Bitte klicken Sie auf einen der folgenden Links für die Prüfung, die Sie interessiert, und gehen Sie dann zum Abschnitt „Prüfungsformat“.</p><h3><a href="/downloads/Mix/Exam%20Pattern/Telc/Telc%20${level}.pdf" target="_blank" rel="noopener"><b>Telc Prüfungsformat – Telc ${level} – Ansehen / Herunterladen</b></a></h3><h3>Goethe Prüfungsformat <a href="https://www.goethe.de/de/spr/prf/vor.html" target="_blank" rel="noopener"><u>Hier klicken</u></a></h3>`;

module.exports = {

  // ── Intensive ───────────────────────────────────────────────────────
  // The English title reads "Individual Session", which is the mismatch
  // the site inventory flagged: this is the Intensive course, not the
  // one-to-one one. The German says what the course actually is.
  "intensive-courses": {
    title: "Intensivkurs A1–B1",
    summary:
      "Von A1 bis B1 in neunzig Tagen. Ein Vollzeitprogramm für alle, die eine Visumsfrist oder einen Studienbeginn einhalten müssen.",
    levelLabel: "Für alle Niveaus geeignet",
    duration: "90 Tage",
    lectures: "50 à 90 Min.",
    description: `${WELCOME}<blockquote>Das Zertifikat Deutsch A1–B1 wird von der Deutschen Botschaft als Nachweis der entsprechenden Kenntnisse der deutschen Sprache anerkannt. Damit können Sie ein Visum zum Ehegattennachzug beantragen.</blockquote><h4>Auf einen Blick</h4><ul><li>Flexible Zeiten, von überall aus</li><li>Individuelle Betreuung durch Ihre Lehrkraft</li><li>Abwechslungsreiche Übungen</li><li>Interessante und aktuelle Themen</li><li>Kostenloser Online-Einstufungstest</li><li>Maximale Teilnehmerzahl: 10</li></ul><h4>So arbeiten wir im Unterricht</h4><ul><li><b>Rollenspiele und Simulationen:</b> Gespräche aus Alltag und Beruf realistisch üben.</li><li><b>Gruppendiskussionen:</b> Sicherheit und Flüssigkeit im gemeinsamen Gespräch über verschiedene Themen aufbauen.</li><li><b>Interaktive Grammatik- und Wortschatzübungen:</b> Das Fundament festigen, mit Übungen, die Freude machen.</li><li><b>Kulturelle Werkstätten:</b> Einblicke in deutsche Kultur, Traditionen und Umgangsformen.</li><li><b>Hör- und Sprechübungen:</b> Aussprache und Verständnis gezielt verbessern.</li></ul>`,
    curriculum: `<h3>Kursinhalte</h3><div class="table-scroll"><table><tbody><tr><td><h4><strong>Modul 1: Grundlagen (Niveau A1)</strong></h4><ul><li>Deutsches Alphabet, Aussprache und Rechtschreibregeln</li><li>Begrüßungen, sich vorstellen, Höflichkeitsformeln</li><li>Zahlen, Datum, Uhrzeit, Wochentage, Monate, Jahreszeiten</li><li>Einfacher Satzbau (Subjekt – Verb – Objekt)</li></ul></td><td><h4><strong>Modul 2: Wortschatzaufbau (A1–A2)</strong></h4><ul><li>Häufige Nomen, Verben, Adjektive</li><li>Familie, Essen, Reise, Arbeit, Gesundheit</li><li>Personen, Orte und Gegenstände beschreiben</li><li>Wendungen für den täglichen Gebrauch</li></ul></td></tr><tr><td><h4><strong>Modul 3: Alltagskommunikation (Niveau A1)</strong></h4><ul><li>Einfache Fragen stellen und beantworten (W-Fragen)</li><li>Sich vorstellen (Name, Beruf, Herkunft)</li><li>Über den Tagesablauf sprechen (Ich gehe, ich esse …)</li><li>Einfache Gespräche im Geschäft, im Restaurant, unterwegs</li></ul></td><td><h4><strong>Modul 4: Kommunikation Mittelstufe (Niveau A2)</strong></h4><ul><li>Über Vergangenes sprechen (Perfekt)</li><li>Meinungen äußern und Vorschläge machen</li><li>Über Pläne und Zukunft sprechen (werden)</li><li>Gespräche bei der Arbeit, bei Terminen, beim Arzt</li></ul></td></tr><tr><td><h4><strong>Modul 5: Grammatik Grundlagen (Niveau A1)</strong></h4><ul><li>Artikel (der, die, das / ein, eine)</li><li>Personalpronomen (ich, du, er, sie …)</li><li>Präsens (regelmäßige und häufige unregelmäßige Verben)</li><li>Modalverben (können, müssen, wollen)</li><li>Satzbildung und Wortstellung</li></ul></td><td><h4><strong>Modul 6: Grammatik Erweiterung (Niveau A2)</strong></h4><ul><li>Perfekt (haben/sein + Partizip II)</li><li>Dativ und Akkusativ</li><li>Präpositionen (mit, für, bei, von …)</li><li>Reflexive Verben (sich waschen, sich freuen)</li><li>Trennbare Verben (anrufen, einkaufen)</li></ul></td></tr><tr><td><h4><strong>Modul 7: Lesen und Hören (A1–A2)</strong></h4><ul><li>Kurze Texte, E-Mails und Hinweise verstehen</li><li>Alltagsgespräche hören</li><li>Wichtige Informationen herausfiltern</li><li>Strategien für das Verstehen aufbauen</li></ul></td><td><h4><strong>Modul 8: Kommunikation Fortgeschritten (Niveau B1)</strong></h4><ul><li>Meinungen, Argumente und Begründungen äußern</li><li>Erlebnisse und Ereignisse schildern</li><li>Über Arbeit, Ausbildung und Ziele sprechen</li><li>Formelle und informelle Kommunikation unterscheiden</li></ul></td></tr><tr><td><h4><strong>Modul 9: Grammatik Fortgeschritten (Niveau B1)</strong></h4><ul><li>Präteritum (war, hatte, ging …)</li><li>Konjunktiv II (würde, könnte, hätte …)</li><li>Passiv (werden + Partizip II)</li><li>Relativsätze (der, die, das …)</li><li>Nebensätze (weil, dass, obwohl, wenn)</li></ul></td><td><h4><strong>Modul 10: Sprechen und Schreiben (A2–B1)</strong></h4><ul><li>E-Mails, Briefe und kurze Texte schreiben</li><li>Sprechen in echten Situationen</li><li>Rollenspiele (Bewerbungsgespräch, Arzt, Büro)</li><li>Vortrag und Diskussion üben</li></ul></td></tr><tr><td><h4><strong>Modul 11: Landeskunde</strong></h4><ul><li>Deutsche Kultur, Traditionen und Umgangsformen</li><li>Arbeitskultur in Deutschland</li><li>Wichtige Feiertage und Feste wie Oktoberfest und Weihnachten</li><li>Soziales Verhalten und Gesprächsstil</li></ul></td><td><h4><strong>Modul 12: Prüfungsvorbereitung und Praxis (Niveau B1)</strong></h4><ul><li>Vollständiges Prüfungstraining (Format Goethe / TELC B1)</li><li>Übung für alle Teile: Lesen, Hören, Schreiben, Sprechen</li><li>Zeitmanagement in der Prüfung</li><li>Modelltests mit Auswertung und Rückmeldung</li></ul></td></tr></tbody></table></div><h3><strong>Leistungsnachweis und Zertifikat</strong></h3><ul><li>Wöchentliche Quiz und Aufgaben</li><li>Übungsprüfungen je Niveau (A1, A2, B1)</li><li>Bewertung der Sprechleistung</li><li>Abschlussprüfung (Zertifikat Niveau B1)</li></ul><p>Dieser Kurs eignet sich für alle, die in kurzer Zeit ein solides Fundament im Deutschen aufbauen und bis zum Niveau B1 sicher kommunizieren wollen.</p><h3>Materialien und Methodik</h3><div class="table-scroll"><table><tbody><tr><td>Kurs- und Arbeitsbuch</td><td>LangNation-Skripte</td><td>Deutsche Geschichten</td><td>Übungsprüfungen</td></tr><tr><td>Live-Sitzungen</td><td>Einzelaufgaben</td><td>Prüfungsvorbereitung</td><td>Quiz</td></tr></tbody></table></div><h4><strong>Unterrichtsstil</strong></h4><ul><li>Interaktive Live-Sitzungen</li><li>Tägliche Übungsaufgaben</li><li>Sprechen im Mittelpunkt</li><li>Training an echten Situationen</li><li>Fortlaufende Rückmeldung</li></ul>`,
    requirements: `<h3>Einstufungstest</h3><p>Für den Intensivkurs ist ein Einstufungstest erforderlich, damit wir Sie richtig einstufen können.</p>${TECH}${CLASSROOM}${COPYRIGHT}`,
    examPattern: `${exam("B1")}`,
  },

  // ── Regular B2 ──────────────────────────────────────────────────────
  "german-regular-b2": {
    title: "Deutsch Regulär B2",
    summary:
      "Komplexe Texte und Fachdiskussionen im eigenen Gebiet verstehen. Passiv, Konnektoren und wissenschaftliche Sprache. Von vielen Hochschulen verlangt und für die Anerkennung in der Pflege.",
    levelLabel: "Obere Mittelstufe",
    duration: "12 Wochen",
    lectures: "50 à 120 Min.",
    description: `${describe("B2", "Deutsch B2 ist die Stufe der selbstständigen Sprachverwendung auf gehobenem Niveau im Gemeinsamen Europäischen Referenzrahmen für Sprachen.")}`,
    curriculum: `<h3>Kursinhalte</h3><div class="table-scroll"><table><tbody><tr><td><p><b>Modul 1: Wortschatz und Themen für Fortgeschrittene</b></p><ul><li>Wortschatz zu Politik, Wirtschaft, Technik, Kultur und globalen Fragen</li><li>Feste Wendungen und Verbverbindungen für flüssiges, natürliches Sprechen</li><li>Abstrakte Begriffe, Meinungen und komplexe Gedanken beschreiben</li><li>Wortschatz für Beruf, Studium und gesellschaftlichen Umgang ausbauen</li></ul></td><td><p><b>Modul 4: Hör- und Leseverstehen</b></p><ul><li>Komplexe Texte wie Artikel, Essays und Nachrichtenbeiträge verstehen und auswerten</li><li>Anspruchsvolles Hörmaterial: Podcasts, Vorträge und Interviews zu verschiedenen Themen</li><li>Feinheiten im Gesprochenen erkennen: Tonfall, Absicht und mitgemeinte Bedeutung</li><li>Informationen aus Text und Ton zusammenfassen und kritisch einordnen</li></ul></td></tr><tr><td><p><b>Modul 2: Grammatik und Satzbau für Fortgeschrittene</b></p><ul><li>Konjunktiv II sicher beherrschen: Wünsche, hypothetische Situationen, indirekte Rede</li><li>Das Passiv in allen Zeitformen vertieft anwenden</li><li>Komplexe Satzgefüge: Relativsätze, Adverbialsätze und anspruchsvolle Konjunktionen</li><li>Wortstellung und Satzfokus differenziert einsetzen</li><li>Modalverben, Konditionalsätze und indirekte Rede auf gehobenem Niveau</li></ul></td><td><p><b>Modul 5: Schreiben</b></p><ul><li>Formelle und informelle Briefe, E-Mails und Berichte in angemessener Struktur und Stilebene</li><li>Argumentative Aufsätze, wissenschaftliche Arbeiten und Meinungsbeiträge verfassen</li><li>Unterschiedliche Standpunkte schriftlich analysieren, bewerten und kritisch prüfen</li><li>Überarbeiten und Korrekturlesen, für fehlerfreie und schlüssige Texte</li></ul></td></tr><tr><td><p><b>Modul 3: Kommunikation für Fortgeschrittene</b></p><ul><li>An Debatten und Diskussionen über strittige Themen teilnehmen</li><li>Die eigene Meinung klar und überzeugend äußern und begründen</li><li>Ausführlich argumentieren, Perspektiven analysieren und Positionen zusammenfassen</li><li>Berufliche und akademische Gespräche führen, einschließlich Vorträgen und Bewerbungsgesprächen</li><li>Verhandeln, überzeugen und Probleme auf Deutsch lösen</li></ul></td><td><p><b>Modul 6: Kultur und sprachlicher Kontext</b></p><ul><li>Deutsche Geschichte, Literatur und Kunst genauer erkunden</li><li>Kulturelle Unterschiede und Gepflogenheiten in den deutschsprachigen Ländern</li><li>Medien, Filme und literarische Werke für tiefere kulturelle Einsichten auswerten</li><li>Aktuelle gesellschaftliche, politische und ökologische Fragen im deutschsprachigen Raum betrachten</li></ul></td></tr></tbody></table></div><p><b>Leistungsnachweis und Zertifikat:</b></p><ul><li>Laufende Bewertung durch Aufgaben, Quiz und Diskussionen</li><li>Abschlussprüfung zum Nachweis des Niveaus B2 in Sprechen, Hören, Lesen und Schreiben</li><li>Zertifikat auf Niveau B2 nach erfolgreichem Abschluss</li></ul><p>Dieser Kurs richtet sich an alle, die im Deutschen schon sicher sind und ihre Flüssigkeit verfeinern möchten. Im Mittelpunkt stehen differenzierter Sprachgebrauch, kritisches Denken und die Anwendung im Beruf wie im gesellschaftlichen Leben.</p>${EXTRA("B2")}`,
    requirements: `<h3>Einstufungstest</h3><p>Für das Niveau B2 ist ein Einstufungstest erforderlich.</p>${TECH}${CLASSROOM}${COPYRIGHT}`,
    examPattern: `${exam("B2")}`,
  },

  // ── Regular B1 ──────────────────────────────────────────────────────
  "german-regular-b1": {
    title: "Deutsch Regulär B1",
    summary:
      "Die Stufe der Selbstständigkeit. Die meisten Situationen auf Reisen und im Beruf bewältigen, begründen und die eigene Meinung sagen, über Pläne sprechen. Das Niveau, das für Visum und Ausbildungsplatz meist verlangt wird.",
    levelLabel: "Mittelstufe",
    duration: "90 Tage",
    lectures: "40 à 120 Min.",
    description: `${describe("B1", "Deutsch B1 ist die Stufe der selbstständigen Sprachverwendung im Gemeinsamen Europäischen Referenzrahmen für Sprachen.")}`,
    curriculum: `<h3>Kursinhalte</h3><div class="table-scroll"><table><tbody><tr><td><p><b>Modul 1: Wortschatz und Themen erweitern</b></p><ul><li>Wortschatz zu Arbeit, Bildung, Umwelt, Technik und gesellschaftlichen Fragen</li><li>Verbverbindungen und feste Wendungen aus dem Alltagsgespräch</li><li>Über aktuelle Ereignisse, Medien und kulturelle Themen sprechen</li></ul></td><td><p><b>Modul 4: Hör- und Leseverstehen</b></p><ul><li>Podcasts, Interviews und Nachrichtenbeiträge verstehen</li><li>Geschriebene Texte erschließen: E-Mails, Artikel, Kurzgeschichten</li><li>In komplexen Gesprächen einzelne Informationen und Zusammenhänge erkennen</li><li>Diskussionen zu verschiedenen Themen hören und die Kernaussagen zusammenfassen</li></ul></td></tr><tr><td><p><b>Modul 2: Grammatik für Fortgeschrittene</b></p><ul><li>Die Vergangenheitsformen sicher beherrschen: Präteritum, Perfekt und Plusquamperfekt</li><li>Konditionalsätze (Konjunktiv II) und hypothetische Situationen</li><li>Komplexe Satzgefüge mit Konjunktionen und Relativsätzen</li><li>Einführung in das Passiv in Gegenwart und Vergangenheit</li><li>Indirekte Rede verstehen und verwenden</li></ul></td><td><p><b>Modul 5: Schreiben</b></p><ul><li>Formelle und informelle Briefe, E-Mails und Berichte schreiben</li><li>Aufsätze und Artikel mit klarer Argumentation und Struktur verfassen</li><li>Rezensionen, Stellungnahmen und Beschreibungen zu verschiedenen Themen</li><li>Texte wirksam zusammenfassen und in eigenen Worten wiedergeben</li></ul></td></tr><tr><td><p><b>Modul 3: Sprechen und Interaktion</b></p><ul><li>Meinungen äußern, zustimmen, widersprechen und den eigenen Standpunkt begründen</li><li>Vorträge halten und Ereignisse, Abläufe und Erfahrungen ausführlich schildern</li><li>Diskutieren, Gefühle ausdrücken und Ratschläge geben</li><li>Rollenspiele für Beruf, Reise und gesellschaftlichen Umgang</li></ul></td><td><p><b>Modul 6: Landeskunde und Praxis</b></p><ul><li>Deutsche Gebräuche, Traditionen und Geschichte genauer verstehen</li><li>Regionale Dialekte, Küche und gesellschaftliche Gewohnheiten der deutschsprachigen Länder</li><li>Zeitgenössische deutsche Literatur, Musik und Medien kennenlernen</li></ul></td></tr></tbody></table></div><p><b>Leistungsnachweis und Zertifikat:</b></p><ul><li>Laufende Tests, Quiz und Aufgaben zur Fortschrittskontrolle</li><li>Abschlussprüfung zum Nachweis des Niveaus B1 und zum Erwerb des Zertifikats</li></ul><p>Dieser Kurs richtet sich an alle, die die Grundlagen des Deutschen beherrschen und nun in anspruchsvolleren Situationen sicher sprechen wollen — mit dem Ziel, flüssiger zu werden und über viele Themen auf Deutsch zu diskutieren.</p>${EXTRA("B1")}`,
    requirements: `<h3>Einstufungstest</h3><p>Für das Niveau B1 ist ein Einstufungstest erforderlich.</p>${TECH}${CLASSROOM}${COPYRIGHT}`,
    examPattern: `${exam("B1")}`,
  },

  // ── Regular A2 ──────────────────────────────────────────────────────
  "german-regular-a2": {
    title: "Deutsch Regulär A2",
    summary:
      "Einkaufen, Arbeit, Familie und Tagesablauf. Dazu kommen Perfekt und Präteritum, trennbare Verben und Modalverben — Sie beginnen, über Vergangenes zu berichten.",
    levelLabel: "Grundstufe",
    duration: "8 Wochen",
    lectures: "25 à 120 Min.",
    description: `${describe("A2", "Deutsch A2 ist die Grundstufe des Gemeinsamen Europäischen Referenzrahmens für Sprachen.")}`,
    curriculum: `<h3>Kursinhalte</h3><div class="table-scroll"><table><tbody><tr><td><p>Modul 1: <b>Wortschatz und Alltagswendungen erweitern</b></p><ul><li>Wortschatz zu Reise, Gesundheit, Arbeit und Freizeit</li><li>Wendungen für den Alltag (Arztbesuch, Einkauf, Essen bestellen)</li><li>Über Erlebnisse, Pläne und eigene Meinungen sprechen</li></ul></td><td><p>Modul 4: <b>Hör- und Leseverstehen</b></p><ul><li>Kurzgeschichten, Anzeigen und einfache Nachrichtentexte verstehen</li><li>Dialoge hören und Kernaussagen erkennen</li><li>Übungen zu Tagesablauf, Wegbeschreibungen und Einkauf</li></ul></td></tr><tr><td><p>Modul 2: <b>Grammatik ausbauen</b></p><ul><li>Starke und schwache Verben in der Vergangenheit (Präteritum und Perfekt)</li><li>Einführung in die Modalverben (können, müssen, dürfen und weitere)</li><li>Trennbare und nicht trennbare Verben im Satz</li><li>Akkusativ und Dativ bei Objekten und Präpositionen</li><li>Steigerung von Adjektiven und Adverbien (Komparativ und Superlativ)</li></ul></td><td><p>Modul 5: <b>Schreiben</b></p><ul><li>Kurze persönliche E-Mails, Postkarten und Briefe schreiben</li><li>Orte, Personen und Erlebnisse einfach beschreiben</li><li>Einfache Begründungen formulieren und schriftlich Stellung nehmen</li></ul></td></tr><tr><td><p>Modul 3: <b>Sprechen und Kommunikation</b></p><ul><li>Über Vergangenes, Pläne und Ziele sprechen</li><li>Den Weg beschreiben und nach Auskunft fragen</li><li>Vorlieben, Wünsche und Bedürfnisse ausdrücken</li><li>Einfache Gespräche über Familie, Arbeit und Hobbys führen</li></ul></td><td><p>Modul 6: <b>Landeskunde</b></p><ul><li>Deutsche Traditionen, Feste und Feiertage auf Niveau A2</li><li>Einblicke in Kultur und Gebräuche der deutschsprachigen Länder</li></ul></td></tr></tbody></table></div>${CERT("A2")}<p>Dieser Kurs eignet sich für alle, die das Niveau A1 abgeschlossen haben und ihr Deutsch vertiefen möchten — mit Blick auf echte Kommunikation und Alltagssituationen.</p>${EXTRA("A2")}`,
    requirements: `<h3>Einstufungstest</h3><p>Für das Niveau A2 ist ein Einstufungstest erforderlich.</p>${TECH}${CLASSROOM}${COPYRIGHT}`,
    examPattern: `${exam("A2")}`,
  },

  // ── Regular A1 ──────────────────────────────────────────────────────
  "german-regular-a1": {
    title: "Deutsch Regulär A1",
    summary:
      "Ihr erstes Deutsch. Begrüßungen, sich vorstellen, Zahlen und Uhrzeiten, das Präsens und genug Alltagswortschatz für einfache, wiederkehrende Gespräche.",
    levelLabel: "Anfänger",
    duration: "8 Wochen",
    lectures: "25 à 120 Min.",
    description: `${WELCOME}<blockquote>Das Zertifikat Deutsch A1 wird von der Deutschen Botschaft als Nachweis von Grundkenntnissen der deutschen Sprache anerkannt. Damit können Sie ein Visum zum Ehegattennachzug beantragen.</blockquote><blockquote>Deutsch A1 ist zugleich die unterste Stufe des Gemeinsamen Europäischen Referenzrahmens für Sprachen.</blockquote><h4>Auf einen Blick</h4><ul><li>Flexible Zeiten, von überall aus</li><li>Individuelle Betreuung durch Ihre Lehrkraft</li><li>Abwechslungsreiche Übungen</li><li>Interessante und aktuelle Themen</li><li>Kostenloser Online-Einstufungstest</li><li>Maximale Teilnehmerzahl: 6 bis 8</li></ul><h4>So arbeiten wir im Unterricht</h4><ul><li><b>Rollenspiele und Simulationen:</b> Gespräche aus Alltag und Beruf realistisch üben.</li><li><b>Gruppendiskussionen:</b> Sicherheit und Flüssigkeit im gemeinsamen Gespräch über verschiedene Themen aufbauen.</li><li><b>Interaktive Grammatik- und Wortschatzübungen:</b> Das Fundament festigen, mit Übungen, die Freude machen.</li><li><b>Kulturelle Werkstätten:</b> Einblicke in deutsche Kultur, Traditionen und Umgangsformen.</li><li><b>Hör- und Sprechübungen:</b> Aussprache und Verständnis gezielt verbessern.</li></ul><p><img src="/img/content/b7e437bbd4ac.webp" alt="" loading="lazy" decoding="async"></p>`,
    curriculum: `<h3>Kursinhalte</h3><div class="table-scroll"><table><tbody><tr><td><p><b>Modul 1: Grundlagen des Deutschen</b></p><ul><li>Das deutsche Alphabet und die Aussprache</li><li>Begrüßungen und sich vorstellen</li><li>Zahlen, Wochentage, Monate und Jahreszeiten</li></ul></td><td><p><b>Modul 4: Kommunikation</b></p><ul><li>Einfache Fragen stellen und beantworten</li><li>Sich vorstellen und Angaben zur Person machen</li><li>Über Tagesablauf und Vorlieben sprechen</li></ul></td></tr><tr><td><p><b>Modul 2: Alltagswortschatz</b></p><ul><li>Häufige Nomen, Verben und Adjektive</li><li>Wichtige Wendungen für Einkauf, Restaurant und Reise</li><li>Personen, Orte und Gegenstände beschreiben</li></ul></td><td><p><b>Modul 5: Hör- und Leseverstehen</b></p><ul><li>Einfache Texte und Hörbeispiele verstehen</li><li>Wichtige Informationen aus Dialogen erkennen</li><li>Hörverstehen für typische Situationen aufbauen</li></ul></td></tr><tr><td><p><b>Modul 3: Grammatische Grundlagen</b></p><ul><li>Artikel (bestimmt und unbestimmt)</li><li>Personalpronomen und Satzbau</li><li>Präsens regelmäßiger und unregelmäßiger Verben</li></ul></td><td><p><b>Modul 6: Landeskunde</b></p><ul><li>Einführung in deutsche Kultur und Traditionen</li><li>Feiertage, Feste und Umgangsformen</li></ul></td></tr></tbody></table></div><p><b>Leistungsnachweis und Zertifikat:</b></p><ul><li>Übungen und Tests, um den Fortschritt zu verfolgen</li><li>Abschlussprüfung für das Zertifikat auf Niveau A1</li></ul><p>Dieser Kurs eignet sich für alle, die von Grund auf ein solides Fundament im Deutschen aufbauen und in einfachen Alltagssituationen sicher sprechen möchten.</p><h3>Materialien und Methodik</h3><div class="table-scroll"><table><tbody><tr><td>Kurs- und Arbeitsbuch</td><td>LangNation-Skripte</td><td>Deutsche Geschichten</td><td>Übungsprüfungen</td></tr><tr><td>Live-Sitzungen</td><td>Einzelaufgaben</td><td>Prüfungsvorbereitung</td><td>Quiz</td></tr></tbody></table></div><h3>Zusätzlich</h3><ul><li>Vorbereitung auf die A1-Prüfung</li><li>Sprechen zu verschiedenen Situationen</li><li>Quiz</li></ul>`,
    requirements: `<h3>Einstufungstest</h3><p>Für das Niveau A1 ist kein Einstufungstest erforderlich.</p>${TECH}${CLASSROOM}${COPYRIGHT}`,
    examPattern: `<p>Bitte klicken Sie auf einen der folgenden Links für die Prüfung, die Sie interessiert, und gehen Sie dann zum Abschnitt „Prüfungsformat“.</p><h3><a href="/downloads/Mix/Exam%20Pattern/Telc/Telc%20A1.pdf" target="_blank" rel="noopener"><b>Telc Prüfungsformat – Telc A1 – Ansehen / Herunterladen</b></a></h3><h3>Goethe Prüfungsformat <a href="https://www.goethe.de/de/spr/prf/vor.html" target="_blank" rel="noopener"><u>Hier klicken</u></a></h3><blockquote>Jeder Tag ist ein neues Abenteuer. Bleiben Sie neugierig, seien Sie mutig, und hören Sie nie auf zu lernen.</blockquote>`,
  },
  // ── C2 ──────────────────────────────────────────────────────────────
  "german-regular-c2": {
    title: "Deutsch Regulär C2",
    summary:
      "Nahezu muttersprachliche Präzision. Nuancen, Redewendungen und Register; komplexe Argumentationen aus mehreren Quellen zusammenfassen und überzeugend wiedergeben.",
    levelLabel: "Fortgeschritten",
    duration: "10 Wochen",
    lectures: "50 à 120 Min.",
    sticker: "In Vorbereitung",
  },

  // ── C1 ──────────────────────────────────────────────────────────────
  "german-regular-c1": {
    title: "Deutsch Regulär C1",
    summary:
      "Fließend und spontan, ohne erkennbar nach Worten zu suchen. Akademisches und berufliches Register, lange Texte, implizite Bedeutung. Das übliche Zulassungsniveau für deutsche Hochschulen.",
    levelLabel: "Fortgeschritten",
    duration: "10 Wochen",
    lectures: "50 à 120 Min.",
    description: `<p>„Deutsch C1 Hochschule“ prüft Ihre hochschulbezogenen Deutschkenntnisse auf sehr hohem Niveau. Der Kurs richtet sich an Erwachsene, die sich an einer deutschen Hochschule einschreiben möchten, sowie an alle, die bereits in Deutschland studieren oder wissenschaftlich arbeiten.</p><h3>Auf einen Blick</h3><ul><li>Davon 10 Stunden pro Woche selbstständiges Lernen (mit Betreuung)</li><li>Flexible Zeiten, von überall aus</li><li>Selbstständiges Lernen mit Betreuung</li><li>Individuelle Betreuung durch Ihre Lehrkraft</li><li>Abwechslungsreiche Übungen</li><li>Interessante und aktuelle Themen</li><li>Kostenloser Online-Einstufungstest</li><li>Maximale Teilnehmerzahl: 5</li></ul>`,
    curriculum: `<h3>Kursinhalte</h3><ul><li>Verben mit festen Präpositionen</li><li>Relativsätze</li><li>Präpositionen mit Genitiv</li><li>Passiv in der Vergangenheit</li></ul><p><br></p>${METHOD}<p><br></p><h3>Enthaltene Materialien</h3><ul><li>Erkundungen/Aspekte C1 – Kurs- und Arbeitsbuch</li><li>LangNation-Skripte</li><li>5 deutsche Geschichten</li><li>10 Übungsprüfungen</li></ul>`,
    requirements: `<h3>Einstufungstest</h3><p>Für das Niveau C1 ist ein Einstufungstest erforderlich.</p>${TECH}`,
    examPattern: `<p>Bitte klicken Sie auf einen der folgenden Links für die Prüfung, die Sie interessiert, und gehen Sie dann zum Abschnitt „Prüfungsformat“.</p><div><h3><a href="/downloads/Mix/Exam%20Pattern/Telc/Telc%20C1.pdf" target="_blank" rel="noopener"><b>Telc Prüfungsformat – Telc C1 – Ansehen / Herunterladen</b></a></h3><h3>Goethe Prüfungsformat <a href="/courses" target="_blank" rel="noopener"><u>Hier klicken</u></a></h3></div>`,
  },

  // ── Individual A1 ───────────────────────────────────────────────────
  "individual-training-a1": {
    title: "Einzelunterricht",
    summary:
      "Privater Einzelunterricht, zeitlich nach Ihnen ausgerichtet und auf Ihr Ziel abgestimmt. Ideal, wenn Sie ein bestimmtes Niveau bis zu einem bestimmten Termin brauchen.",
    duration: "Nach Absprache",
    lectures: "Preis pro Stunde",
    description: `<p>Das Zertifikat Deutsch A1 wird von den deutschen Botschaften als Nachweis von Grundkenntnissen der deutschen Sprache anerkannt. Damit können Sie ein Visum zum Ehegattennachzug beantragen.</p><p>Deutsch A1 ist zugleich die unterste Stufe des Gemeinsamen Europäischen Referenzrahmens für Sprachen.</p><h3>Auf einen Blick</h3><ul><li>Flexible Zeiten, von überall aus</li><li>Individuelle Betreuung durch Ihre Lehrkraft</li><li>Abwechslungsreiche Übungen</li><li>Interessante und aktuelle Themen</li><li>Kostenloser Online-Einstufungstest</li><li>Maximale Teilnehmerzahl: 1 bis 3</li></ul><h3><b>Gebühren (AGB)</b></h3><ul><li>Bei 1 Teilnehmer beträgt die Gebühr 15 €</li><li>Bei 2 Teilnehmern beträgt die Gebühr 12 €</li><li>Bei 3 Teilnehmern beträgt die Gebühr 10 €</li><li>Ab 4 Teilnehmern richten wir einen Gruppenkurs ein. <a href="/courses" target="_blank" rel="noopener"><b>Hier klicken</b></a> für Gruppenkurse.</li></ul>`,
    requirements: `<h3>Einstufungstest</h3><p>Für das Niveau A1 ist kein Einstufungstest erforderlich.</p>${TECH}`,
    curriculum: `<h3>Kursinhalte</h3><ul><li>Grundlagen der deutschen Sprache</li><li>Alphabet und Aussprache</li><li>Wortschatzliste</li><li>Das Zahlensystem</li><li>Konjugation schwacher Verben</li><li>Artikel</li><li>Pronomen</li><li>Modalverben</li><li>Hilfsverben</li><li>Trennbare Verben</li><li>Dativ, Akkusativ und Wechselpräpositionen</li><li>Das Genus erkennen</li><li>Präpositionen mit Symbolen</li><li>Die Wechselregel</li><li>Das deutsche Kasussystem</li><li>Zeitangaben im Deutschen</li><li>Am, um, im — aber und sondern</li><li>W-Fragen</li><li>Partizip II und Liste</li><li>Konjunktionen</li><li>Verben in Gegenwart, Vergangenheit und Zukunft</li></ul>${METHOD}<h3>Enthaltene Materialien</h3><ul><li>A1 Kurs- und Arbeitsbuch</li><li>LangNation-Skripte</li><li>Deutsche Geschichten</li><li>Übungsprüfungen</li></ul><h3>Zusätzlich</h3><ul><li>Vorbereitung auf die A1-Prüfung</li><li>Sprechen zu verschiedenen Situationen</li><li>Quiz</li></ul>`,
    examPattern: `${exam("A1")}`,
  },

  // ── Individual A2 (school) ──────────────────────────────────────────
  "individual-training-a2": {
    title: "Einzelunterricht Schule",
    summary:
      "Einzelunterricht für Schülerinnen und Schüler, abgestimmt auf das Deutsch, das der Lehrplan verlangt, und auf die Themen, bei denen es gerade hakt.",
    levelLabel: "Schule",
    duration: "Nach Absprache",
    lectures: "Preis pro Stunde",
    description: `<p>Das Zertifikat Deutsch A2 wird von den deutschen Botschaften als Nachweis von Grund- und erweiterten Grundkenntnissen der deutschen Sprache anerkannt. Damit können Sie ein Visum zum Ehegattennachzug beantragen.</p><h3>Auf einen Blick</h3><ul><li>Davon 10 Stunden pro Woche selbstständiges Lernen (mit Betreuung)</li><li>Flexible Zeiten, von überall aus</li><li>Selbstständiges Lernen mit Betreuung</li><li>Individuelle Betreuung durch Ihre Lehrkraft</li><li>Abwechslungsreiche Übungen</li><li>Interessante und aktuelle Themen</li><li>Kostenloser Online-Einstufungstest</li><li>Maximale Teilnehmerzahl: 1 bis 3</li></ul><h3>Gebühren (AGB)</h3><ul><li>Bei 1 Teilnehmer beträgt die Gebühr 15 €</li><li>Bei 2 bis 3 Teilnehmern beträgt die Gebühr 12 €</li><li>Bei 4 bis 5 Teilnehmern beträgt die Gebühr 10 €</li></ul>`,
    curriculum: `<h3>Kursinhalte</h3><ul><li>Wortschatz nach Themen</li><li>Deutsche Redewendungen</li><li>Konjugation starker und trennbarer Verben</li><li>Liste der starken Verben</li><li>Liste der trennbaren Verben</li><li>Genus</li><li>Artikel in allen Fällen</li><li>Modal- und Hilfsverben in der Vergangenheit</li><li>Präpositionen mit Symbolen</li><li>Präpositionen für Zeit und Datum</li><li>Partizip II</li><li>Präteritum</li><li>Das Verb in Gegenwart, Vergangenheit und Zukunft</li><li>Relativpronomen</li><li>Reflexivpronomen (Akkusativ)</li><li>Indefinitpronomen</li><li>Adjektive und Steigerung</li><li>Damit und Um … zu</li><li>W-Fragen mit Präposition</li><li>Imperativ</li><li>Konjunktionen: koordinierend, subordinierend, adverbial</li><li>Konjunktiv II</li><li>Interrogativartikel</li><li>Genitiv</li></ul>${METHOD}<h3>Enthaltene Materialien</h3><ul><li>A2 Kurs- und Arbeitsbuch</li><li>LangNation-Skripte</li><li>Deutsche Geschichten</li><li>Übungsprüfungen</li></ul>`,
    requirements: `<h3>Einstufungstest</h3><p>Für das Niveau A2 ist ein Einstufungstest erforderlich.</p>${TECH}`,
    examPattern: `<p>Bitte klicken Sie auf einen der folgenden Links für die Prüfung, die Sie interessiert, und gehen Sie dann zum Abschnitt „Prüfungsformat“.</p><h3><a href="/downloads/Mix/Exam%20Pattern/Telc/Telc%20A2.pdf" target="_blank" rel="noopener">Telc Prüfungsformat – Telc A2 – Ansehen / Herunterladen</a></h3><h3>Goethe Prüfungsformat <a href="/courses" target="_blank" rel="noopener"><u>Hier klicken</u></a></h3>`,
  },
};
