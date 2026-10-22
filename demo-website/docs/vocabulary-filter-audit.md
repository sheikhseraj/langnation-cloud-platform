# Vocabulary filter audit

Snapshot: e4e8c5c484a4eb92ea6476cee5e7d0d6648c88766f97739c9ef6b6974b5ebe81. Checked **12252** Dictionary rows; **2532** enabled. The supplied CSV is a content-only, complete snapshot. No live database connection or write was performed.

## Current versus planned repair

| Measure | Export | After local repair model |
| --- | ---: | ---: |
| total | 12252 | 12253 |
| enabled | 2532 | 2613 |
| unclassified | 9720 | 9640 |
| disabled | 0 | 0 |

The after column is a dry-run result, not a claim that production has changed. All existing IDs and existing primary levels remain unchanged. Only formal **Sie** is proposed as a genuinely missing lexical item; **möchten**, **kein**, and all selected legacy prepositions reuse existing IDs.

## Closed-class completeness

| Set | Missing in export | Missing after model |
| --- | --- | --- |
| modal | dürfen, können, möchten, sollen, wollen | none |
| accusative | bis, durch, für, gegen, ohne, um, entlang | none |
| dative | außer, bei, mit, nach, seit, von, zu, gegenüber | none |
| dativeExtended | ab, außer, bei, mit, nach, seit, von, zu, gegenüber | none |
| twoWay | an, auf, hinter, in, neben, über, unter, vor, zwischen | none |
| genitive | wegen, trotz, während, statt, anstatt, innerhalb, außerhalb, oberhalb, unterhalb, hinsichtlich, bezüglich, zugunsten | none |
| articles | kein | none |
| pronouns | Sie | none |
| coordinating | und, oder, aber, denn, sondern | none |
| subordinating | weil, dass, wenn, obwohl, während, bevor, nachdem, damit, falls, sofern, sobald, solange, seitdem, bis | none |
| conjunctionalAdverbs | deshalb, deswegen, daher, trotzdem, außerdem, dennoch, folglich, somit, allerdings | none |

## Counts for every controlled filter

### types

| Code | Label | Export enabled | Model enabled |
| --- | --- | ---: | ---: |
| W01 | Nomen | 1695 | 1695 |
| W02 | Verb | 340 | 355 |
| W03 | Adjektiv | 151 | 151 |
| W04 | Adverb | 52 | 61 |
| W05 | Präposition | 7 | 44 |
| W06 | Konjunktion | 9 | 28 |
| W07 | Pronomen | 11 | 13 |
| W08 | Artikel | 5 | 6 |
| W09 | Numerale | 24 | 24 |
| W10 | Partikel | 0 | 0 |
| W11 | Interjektion | 0 | 0 |
| W12 | Redewendung / Phrase | 238 | 238 |

### grammar

| Code | Label | Export enabled | Model enabled |
| --- | --- | ---: | ---: |
| G01 | Nominativ | 5 | 14 |
| G02 | Akkusativ | 5 | 30 |
| G03 | Dativ | 18 | 50 |
| G04 | Genitiv | 3 | 21 |
| G05 | Akkusativ-Verben | 210 | 213 |
| G06 | Dativ-Verben | 11 | 16 |
| G07 | Genitiv-Verben | 3 | 3 |
| G08 | Verben mit zwei Objekten | 15 | 14 |
| G09 | Verben mit Präpositionen | 27 | 34 |
| G10 | Präpositionen mit Akkusativ | 0 | 7 |
| G11 | Präpositionen mit Dativ | 1 | 10 |
| G12 | Wechselpräpositionen | 0 | 9 |
| G13 | Präpositionen mit Genitiv | 6 | 18 |
| G14 | Regelmäßige Verben | 243 | 244 |
| G15 | Unregelmäßige Verben | 83 | 95 |
| G16 | Trennbare Verben | 60 | 60 |
| G17 | Untrennbare Verben | 14 | 14 |
| G18 | Reflexive Verben | 37 | 38 |
| G19 | Modalverben | 2 | 7 |
| G20 | Hilfsverben | 1 | 1 |
| G21 | Perfekt mit haben | 310 | 318 |
| G22 | Perfekt mit sein | 18 | 18 |
| G23 | Präteritum – wichtige Formen | 2 | 6 |
| G24 | Partizip II | 0 | 0 |
| G25 | Nebenordnende Konjunktionen | 0 | 5 |
| G26 | Unterordnende Konjunktionen | 9 | 23 |
| G27 | Konjunktionaladverbien | 3 | 12 |
| G28 | Satzverknüpfungen | 14 | 31 |
| G29 | Temporale Ausdrücke | 28 | 32 |
| G30 | Lokale Ausdrücke | 10 | 12 |
| G31 | Kausale Ausdrücke | 6 | 12 |
| G32 | Modale Ausdrücke | 12 | 12 |
| G33 | Meinungen ausdrücken | 16 | 16 |
| G34 | Zustimmung & Ablehnung | 33 | 34 |
| G35 | Vergleichen | 21 | 21 |
| G36 | Begründen | 40 | 40 |
| G37 | Vermuten | 31 | 31 |
| G38 | Vorschläge & Empfehlungen | 13 | 13 |

### themes

| Code | Label | Export enabled | Model enabled |
| --- | --- | ---: | ---: |
| T01 | Persönliche Angaben | 43 | 44 |
| T02 | Familie & Beziehungen | 51 | 52 |
| T03 | Alltag & Tagesablauf | 70 | 84 |
| T04 | Gefühle & Persönlichkeit | 59 | 62 |
| T05 | Soziale Kontakte | 91 | 94 |
| T06 | Feste & besondere Anlässe | 43 | 43 |
| T07 | Wohnen & Haushalt | 84 | 92 |
| T08 | Essen & Trinken | 103 | 103 |
| T09 | Einkaufen | 91 | 92 |
| T10 | Kleidung & Mode | 60 | 61 |
| T11 | Dienstleistungen | 92 | 92 |
| T12 | Schule & Lernen | 98 | 98 |
| T13 | Studium & Ausbildung | 94 | 94 |
| T14 | Deutsch & Sprachen | 106 | 107 |
| T15 | Prüfungen & Qualifikationen | 75 | 75 |
| T16 | Arbeit & Beruf | 159 | 160 |
| T17 | Bewerbung & Karriere | 71 | 71 |
| T18 | Arbeitsplatz & Kommunikation | 154 | 154 |
| T19 | Geld & Finanzen | 143 | 143 |
| T20 | Wirtschaft | 248 | 248 |
| T21 | Reisen & Urlaub | 95 | 96 |
| T22 | Verkehr & Mobilität | 115 | 120 |
| T23 | Stadt & Orientierung | 89 | 105 |
| T24 | Länder & Nationalitäten | 56 | 56 |
| T25 | Unterkunft & Hotel | 62 | 62 |
| T26 | Körper | 51 | 51 |
| T27 | Gesundheit & Krankheit | 164 | 164 |
| T28 | Arzt & Apotheke | 131 | 131 |
| T29 | Ernährung & Fitness | 113 | 113 |
| T30 | Zeit & Datum | 75 | 81 |
| T31 | Zahlen & Mengen | 78 | 78 |
| T32 | Wetter | 57 | 57 |
| T33 | Natur & Tiere | 74 | 74 |
| T34 | Umwelt & Klima | 181 | 181 |
| T35 | Kommunikation | 574 | 616 |
| T36 | Telefon & E-Mail | 72 | 72 |
| T37 | Medien & Nachrichten | 111 | 111 |
| T38 | Internet & soziale Medien | 138 | 138 |
| T39 | Technik & Digitalisierung | 151 | 151 |
| T40 | Behörden & Dokumente | 87 | 87 |
| T41 | Migration & Integration | 84 | 84 |
| T42 | Gesellschaft | 335 | 335 |
| T43 | Politik | 226 | 226 |
| T44 | Recht | 321 | 321 |
| T45 | Kultur & Kunst | 107 | 107 |
| T46 | Religion & Tradition | 74 | 74 |
| T47 | Wissenschaft & Forschung | 351 | 351 |
| T48 | Bildung | 140 | 140 |
| T49 | Geschichte | 81 | 81 |
| T50 | Globalisierung | 202 | 202 |

## Classification findings

Unsupported primary word types: 23. Invalid grammar/type links: 0. Unknown taxonomy relations: 0. Duplicate lemma/type groups: 1816; preserved, not merged.

Curriculum: 3093 rows, 3010 Approved. Exact source SHA256: c9e350ea49bb2cc5cc5a2e629e230678471822d45e7aa2571ec7f172f24b4b8d. The XLSX and frozen transport/release hashes were not rewritten.

- LN00713 sich bewerben: Strong past form tagged regular.
- LN00770 herunterladen: Strong past form tagged regular.
- LN00771 hochladen: Strong past form tagged regular.
- LN00849 informieren: Prepositional complement is not a second nominal object.
- LN00923 deswegen: Conjunctional adverb typed as conjunction.
- LN00994 überweisen: Strong past form tagged regular.
- LN01047 teilen: Prepositional complement is not a second nominal object.
- LN01659 erziehen: Strong past form tagged regular.
- LN01915 insofern: Conjunctional adverb typed as conjunction.
- LN02142 instand halten: Strong past form tagged regular.
- LN03077 sich einer Sache bedienen: Weak verb incorrectly tagged irregular.
- LN03078 einer Sache entbehren: Weak verb incorrectly tagged irregular.

## Reviewed repairs

| Rule | Stable ID | Changes |
| --- | --- | --- |
| dürfen|W02 | vocabulary:5180 | verb; A1; G15, G19, G23 |
| können|W02 | vocabulary:5288 | verb; A1; G15, G19, G23 |
| mögen|W02 | vocabulary:41 | verb; A1; G05, G15, G19, G21 |
| möchten|W02 | vocabulary:7076 | verb; A1; G15, G19 |
| müssen|W02 | vocabulary:9614 | verb; A1; G15, G19, G23 |
| sollen|W02 | vocabulary:5290 | verb; A1; G15, G19, G23 |
| wollen|W02 | vocabulary:10 | verb; A1; G15, G19, G23 |
| bis|W05 | vocabulary:10001 | preposition; A1; G02, G10, G26 |
| durch|W05 | vocabulary:6180 | preposition; A1; G02, G10 |
| für|W05 | vocabulary:6172 | preposition; A1; G02, G10 |
| gegen|W05 | vocabulary:6216 | preposition; A1; G02, G10 |
| ohne|W05 | vocabulary:6174 | preposition; A1; G02, G10 |
| um|W05 | vocabulary:6218 | preposition; A1; G02, G10 |
| entlang|W05 | vocabulary:6219 | preposition; A2; G02, G10 |
| aus|W05 | vocabulary:13574 | preposition; A1; G03, G11 |
| ab|W05 | vocabulary:6346 | preposition; A2; G03, G11 |
| außer|W05 | vocabulary:7743 | preposition; A2; G03, G11 |
| bei|W05 | vocabulary:6217 | preposition; A1; G03, G11 |
| mit|W05 | vocabulary:6171 | preposition; A1; G03, G11 |
| nach|W05 | vocabulary:6176 | preposition; A1; G03, G11 |
| seit|W05 | vocabulary:6181 | preposition; A1; G03, G11 |
| von|W05 | vocabulary:6169 | preposition; A1; G03, G11 |
| zu|W05 | vocabulary:6170 | preposition; A1; G03, G11 |
| gegenüber|W05 | vocabulary:6184 | preposition; A2; G03, G11 |
| an|W05 | vocabulary:6209 | preposition; A1; G02, G03, G12 |
| auf|W05 | vocabulary:6167 | preposition; A1; G02, G03, G12 |
| hinter|W05 | vocabulary:6213 | preposition; A1; G02, G03, G12 |
| in|W05 | vocabulary:6166 | preposition; A1; G02, G03, G12 |
| neben|W05 | vocabulary:6109 | preposition; A1; G02, G03, G12 |
| über|W05 | vocabulary:6111 | preposition; A1; G02, G03, G12 |
| unter|W05 | vocabulary:6110 | preposition; A1; G02, G03, G12 |
| vor|W05 | vocabulary:6175 | preposition; A1; G02, G03, G12 |
| zwischen|W05 | vocabulary:6112 | preposition; A1; G02, G03, G12 |
| wegen|W05 | vocabulary:5592 | preposition; B1; G04, G13, G31 |
| trotz|W05 | vocabulary:5591 | preposition; B1; G04, G13, G28 |
| während|W05 | vocabulary:6223 | preposition; B1; G04, G13, G29 |
| statt|W05 | vocabulary:6222 | preposition; B1; G04, G13, G28 |
| anstatt|W05 | vocabulary:6274 | preposition; B1; G04, G13 |
| innerhalb|W05 | vocabulary:6224 | preposition; B1; G04, G13, G30 |
| außerhalb|W05 | vocabulary:6225 | preposition; B1; G04, G13, G30 |
| oberhalb|W05 | vocabulary:8975 | preposition; B1; G04, G13 |
| unterhalb|W05 | vocabulary:8974 | preposition; B1; G04, G13 |
| hinsichtlich|W05 | vocabulary:10821 | preposition; B2; G04, G13, G28 |
| bezüglich|W05 | vocabulary:10820 | preposition; B2; G04, G13, G28 |
| zugunsten|W05 | vocabulary:12722 | preposition; B2; G04, G13, G34 |
| und|W06 | vocabulary:6154 | conjunction; A1; G25 |
| oder|W06 | vocabulary:6155 | conjunction; A1; G25 |
| aber|W06 | vocabulary:6156 | conjunction; A1; G25 |
| denn|W06 | vocabulary:6312 | conjunction; A1; G25 |
| sondern|W06 | vocabulary:6228 | conjunction; A1; G25 |
| weil|W06 | vocabulary:6158 | conjunction; A2; G26, G31 |
| dass|W06 | vocabulary:6326 | conjunction; A2; G26, G28 |
| wenn|W06 | vocabulary:6160 | conjunction; A2; G26, G28 |
| obwohl|W06 | vocabulary:6199 | conjunction; A2; G26, G28 |
| während|W06 | vocabulary:10020 | conjunction; A2; G26, G28 |
| bevor|W06 | vocabulary:6162 | conjunction; A2; G26, G28 |
| nachdem|W06 | vocabulary:6163 | conjunction; A2; G26, G28 |
| damit|W06 | vocabulary:3408 | conjunction; A2; G26, G28 |
| falls|W06 | vocabulary:6269 | conjunction; A2; G26, G28 |
| sofern|W06 | vocabulary:10809 | conjunction; B2; G26, G28 |
| sobald|W06 | vocabulary:6164 | conjunction; B1; G26, G29 |
| solange|W06 | vocabulary:6271 | conjunction; B1; G26, G29 |
| seitdem|W06 | vocabulary:9038 | conjunction; B1; G26, G29 |
| deshalb|W04 | vocabulary:6186 | adverb; A2; G27, G31 |
| deswegen|W04 | vocabulary:6187 | adverb; B1; G27 |
| daher|W04 | vocabulary:6185 | adverb; B1; G27, G31 |
| trotzdem|W04 | vocabulary:6194 | adverb; A2; G27, G28 |
| außerdem|W04 | vocabulary:6188 | adverb; A2; G27, G28 |
| dennoch|W04 | vocabulary:6195 | adverb; B1; G27, G28 |
| folglich|W04 | vocabulary:6322 | adverb; B1; G27, G31 |
| somit|W04 | vocabulary:6323 | adverb; B1; G27, G31 |
| allerdings|W04 | vocabulary:6190 | adverb; B1; G27, G28 |
| helfen|W02 | vocabulary:26 | verb; A1; G03, G06, G09, G15, G21 |
| danken|W02 | vocabulary:307 | verb; A1; G03, G06, G14, G21 |
| gefallen|W02 | vocabulary:7075 | verb; A1; G03, G06, G15, G21 |
| gehören|W02 | vocabulary:13677 | verb; A1; G03, G06, G14, G21 |
| schmecken|W02 | vocabulary:4197 | verb; A2; G03, G06, G14, G21 |
| passen|W02 | vocabulary:10157 | verb; A1; G03, G06, G14, G21 |
| fehlen|W02 | vocabulary:5285 | verb; A1; G03, G06, G14, G21 |
| folgen|W02 | vocabulary:254 | verb; A2; G03, G06 |
| vertrauen|W02 | vocabulary:336 | verb; A2; G03, G06 |
| antworten|W02 | vocabulary:36 | verb; A1; G03, G06, G14, G21 |
| sagen|W02 | vocabulary:6 | verb; A1; G05, G08, G14, G21 |
| warten|W02 | vocabulary:37 | verb; A1; G09, G14, G21 |
| denken|W02 | vocabulary:9 | verb; A1; G09, G15, G21 |
| sich freuen|W02 | vocabulary:4276 | verb; A2; G09, G14, G18, G21 |
| teilnehmen|W02 | vocabulary:427 | verb; A2; G09, G15, G16, G21 |
| sprechen|W02 | vocabulary:11 | verb; A1; G09, G15, G21 |
| abhängen|W02 | vocabulary:11644 | verb; B1; G09, G15, G16, G21 |
| sich kümmern|W02 | vocabulary:13770 | verb; A2; G09, G14, G18, G21 |
| sich bewerben|W02 | vocabulary:3931 | verb; A2; G09, G15, G18, G21 |
| herunterladen|W02 | vocabulary:391 | verb; A2; G05, G15, G16, G21 |
| hochladen|W02 | vocabulary:392 | verb; A2; G05, G15, G16, G21 |
| überweisen|W02 | vocabulary:5276 | verb; A2; G05, G08, G15, G21 |
| erziehen|W02 | vocabulary:5463 | verb; B1; G05, G15, G21 |
| der|W08 | vocabulary:13582 | article; A1; G01, G02, G03, G04 |
| die|W08 | vocabulary:13583 | article; A1; G01, G02, G03, G04 |
| das|W08 | vocabulary:13584 | article; A1; G01, G02, G03, G04 |
| ein|W08 | vocabulary:13585 | article; A1; G01, G02, G03, G04 |
| eine|W08 | vocabulary:13586 | article; A1; G01, G02, G03, G04 |
| kein|W08 | vocabulary:4217 | article; A1; G01, G02, G03, G04 |
| ich|W07 | vocabulary:13575 | pronoun; A1; G01, G02, G03 |
| du|W07 | vocabulary:13576 | pronoun; A1; G01, G02, G03 |
| er|W07 | vocabulary:13577 | pronoun; A1; G01, G02, G03 |
| sie|W07 | vocabulary:13578 | pronoun; A1; G01, G02, G03 |
| es|W07 | vocabulary:13579 | pronoun; A1; G01, G02, G03 |
| wir|W07 | vocabulary:13580 | pronoun; A1; G01, G02, G03 |
| ihr|W07 | vocabulary:13581 | pronoun; A1; G01, G02, G03 |
| Sie|W07 | new, assigned at apply | pronoun; A1; G01, G02, G03 |
| informieren|W02 | vocabulary:295 | verb; A2; G05, G09, G14, G21 |
| teilen|W02 | vocabulary:400 | verb; A2; G05, G09, G14, G21 |
| instand halten|W02 | vocabulary:14435 | verb; B2; G05, G15, G21 |
| sich einer Sache bedienen|W02 | vocabulary:15222 | verb; C2; G04, G07, G14, G18, G21 |
| einer Sache entbehren|W02 | vocabulary:15223 | verb; C2; G04, G07, G14, G21 |

Each rule checks its exact ID, visible word, English sense, and original/target type. Mapping-based rules resolve already deployed curriculum IDs. Missing/stale/disabled evidence blocks the whole batch before writes. The versioned ledger, relation primary keys, transaction, before/after audit, and checksum protect repeated apply. No new vocabulary is inserted for inflected article forms or two-case prepositions.

## Manual review

- insofern: Conjunctional adverb typed as conjunction
- Legacy unsupported word types and duplicate lemma/type groups remain intact; do not infer all classifications from broad text or delete IDs.
- Audio URLs are unavailable in the current bridge; device speech remains optional.
- es geht: construction of gehen; not a separate Dativ verb. sagen: Dat. + Akk. construction is G08.
- Three enabled G07 constructions already exist; keep their C2 levels and exact senses. Correct weak/strong tags without adding arbitrary Genitiv verbs.

## Grammar references

- [IDS modal verbs](https://grammis.ids-mannheim.de/systematische-grammatik/380): mögen/möchte and core modal constructions.
- [IDS entlang](https://grammis.ids-mannheim.de/praepositionen/299312): postposed Akkusativ, preposed Genitiv and rarer Dativ.
- [IDS bis zu](https://grammis.ids-mannheim.de/fragen/3138): case is governed by the following preposition.
- [IDS prepositional groups](https://grammis.ids-mannheim.de/sgt/2262): all nine two-case prepositions and location/direction.
- [IDS sagen, sense 2](https://grammis.ids-mannheim.de/verbs/view/400841/2): Dat. + Akk. construction.

## Theme mapping audit

All 50 canonical labels are unique; no unknown stored taxonomy code was found. Every enabled entry has at least one theme. 588 enabled entries have more than three themes; these are listed in the JSON report for sense-by-sense review. Cross-disciplinary tagging is not automatically an error. Existing source theme IDs are retained; reviewed additions distinguish spatial, temporal, social-contact and communication senses. Broad keyword matching is never used to rewrite themes.

## Implementation report

### 1. Root cause

The export contains 12,252 lexical rows but only 2,532 are learning-enabled. Important prepositions were stored under legacy phrase/other types and had no learning classification. Several modal senses existed without G19 or without enabled metadata. The initial enabled counts were G19=2, G10=0, G11=1 and G12=0. The existing cross-group SQL already used AND; incomplete metadata was the principal cause. Source review also found strong verbs tagged G14, weak verbs tagged G15, conjunctional adverbs typed W06, and incorrect G08 complement tags.

### 2. Files modified

Dictionary: curriculum-schema.js; vocabulary-learning.js; vocabulary-learning-api.js; vocabulary-taxonomy-repair.js; vocabulary-taxonomy-sql.js; vocabulary-filter-audit.js; tools/audit-vocabulary-filters.js; database/curriculum/vocabulary-filter-review.json; database/migrations/009_vocabulary_filter_audit.sql; database/repairs/vocabulary-filter-20261009.sql; tests/vocabulary-learning.test.cjs; tests/vocabulary-filter-audit.test.cjs; tests/helpers/learning-sqlite.cjs; tests/fixtures/vocabulary-filter-snapshot.json; docs/vocabulary-filter-audit.md; reports/vocabulary-filter-audit.json.

Website: lib/vocabulary-client.js; routes/vocabulary-learning.js; views/pages/portal/vocabulary.ejs; public/js/vocabulary-dashboard.js; public/js/vocabulary-select.js; public/js/vocabulary-ui.js; public/css/vocabulary.css; tools/check-vocabulary-learning.js; tools/check-vocabulary-filter-ui.js; package.json; docs/vocabulary-filter-audit.md; reports/vocabulary-filter-audit.json.

### 3. Database and data fixes

114 reviewed rules reuse 113 existing Dictionary IDs and propose one genuinely absent formal Sie entry through the existing creation rules. No existing IDs, meanings or assigned CEFR levels change. Unclassified senses receive reviewed levels; already explicitly disabled classifications block the apply. Projected enabled count: 2,613. Relations use composite primary keys and INSERT IGNORE. Migration 009 adds controlled word-type relations, structured learning forms/senses/notes and versioned before/after audit records. It is intentionally absent from startup migrations.

Repairs add missing grammar/theme relations and primary types; bis gains a secondary conjunction function on the same ID; kein has article forms and its determiner/pronoun function; sie retains separate she/they senses on its established ID. Reviewed strong/mixed verb rules and two weak C2 constructions correct regularity tags/flags. The existing möchten teaching entry keeps its ID, is explicitly linked to mögen, and loses incorrectly assigned mögen past/participle fields. Missing müssen principal parts are inserted into the existing forms architecture. Along/entlang notes correct the reversed case rule. Existing examples are retained; no audio URL is invented.

### 4. API and filter changes

Theme, Grammar, Word Type, level, IDs and search are bound SQL intersections. Multi-function word types use an indexed relation; meanings/senses do not multiply result rows. Search includes lemma, German display word, English meaning, noun plural, verb principal parts, adjective forms and structured learner forms. %, _ and ! are escaped as literal search characters. The new service-key-protected /api/v1/dictionary/vocabulary/facets endpoint returns all canonical codes with contextual counts in three grouped queries, excluding only its own group selection. The authenticated website proxy validates the full count contract. Administrative taxonomy status reads the persistent version ledger and exposes no apply endpoint.

### 5. UI changes

The lower duplicate Niveau select is removed. The main level selector, including Alle, provides level context to the filter panel and next-page learning session. Reset clears Theme/Grammar/Type/search while retaining the upper selected level and block. Theme and Grammar have searchable popovers, selected/active highlighting, Arrow/Home/End/Enter keyboard navigation, bounded scroll, Escape closure and focus return. Word Type remains native. Accurate counts come from the API. An empty intersection disables start and displays “Keine Vokabeln für diese Filter gefunden.” with reset available. All-level blocks and filtered sets open the existing shared learning workspace.

### 6–9. Exact required sets verified by bound SQL against the local repair model

| Filter | Verified required set |
| --- | --- |
| modal | dürfen, können, mögen, möchten, müssen, sollen, wollen |
| accusative | bis, durch, für, gegen, ohne, um, entlang |
| dativeExtended | aus, ab, außer, bei, mit, nach, seit, von, zu, gegenüber |
| twoWay | an, auf, hinter, in, neben, über, unter, vor, zwischen |

### 10. Article coverage

der, die, das, ein, eine and kein are all available under W08. Structured case forms include keine/keinem/keinen/keiner/keines without creating separate inflection entries. Existing ein/eine curriculum architecture is retained. Legacy keine (ID 4223, noun/“no one”) remains isolated for manual sense review.

### 11. Pronoun coverage

ich, du, er, sie, es, wir, ihr and formal Sie are available under W07. Lowercase sie has distinct she and they meanings with corresponding dative forms; uppercase Sie has formal-you meaning and Ihnen/Ihr forms. Case-sensitive matching prevents merging these records.

### 12. Theme audit

All T01–T50 are counted above. Unknown codes: 0. Duplicate theme labels: 0. Enabled entries missing themes: 0. Broad tagging candidates: 588, listed in reports/vocabulary-filter-audit.json. Themes are corrected only on reviewed senses.

### 13. Grammar audit

All G01–G38 are counted above and every canonical filter is executed in tests. Required coordinating, subordinating, conjunctional-adverb and genitive-preposition sets pass. Existing three C2 G07 constructions remain; bedienen/entbehren are weak verbs. sagen is a Dat.+Akk. construction, not an arbitrary pure Dativ verb; helfen bei is stored as a pattern. informieren and teilen lose invalid two-nominal-object tags. G24 has no approved enabled standalone teaching entries. W10/W11 likewise have zero enabled approved entries. Their zero counts remain honest. The frozen source workbook/release hash is preserved; the reviewed overlay records corrections without silently changing deployed curriculum evidence.

### 14. Tests and results

- Dictionary npm test: **197 passed, 0 failed**.
- Complete supplied export with DICTIONARY_AUDIT_SNAPSHOT: **32 passed, 0 failed**, all 12,252 rows loaded.
- Website npm run check: passed all existing content, templates, SQL, portal, homework, billing, reading, community and vocabulary checks. Existing local configuration warnings concern staging origin, incomplete imprint, unset SMTP and unset database configuration.
- Website vocabulary suite: **62 passed, 0 failed**.
- Cross-application vocabulary contract integration: **2 passed, 0 failed**.
- Browser QA: desktop light theme; 390×844 mobile dark theme; searchable selector/Enter; Escape focus return; reset preserves B1 and block 51–100; filtered next-page modal learning; repaired müssen principal parts; no mobile horizontal overflow. Proof screenshots saved in the task artifact directory.

The SQL predicate and projection tests execute through a test-only Node 24 SQLite adapter; only MySQL GROUP_CONCAT ordering syntax is adapted. MySQL stored-procedure execution, MySQL collation behavior and production API results have **not** been verified against a live database. Transaction failure/ledger behavior is tested with connection fixtures. These are explicit validation limits, not claims of a production apply.

### 15. Remaining review and apply status

- 23 legacy unsupported POS rows remain unchanged and are listed with IDs in the JSON report.
- 1816 same-lemma/type groups remain intact. Many are distinct bilingual senses; automatic merging would lose IDs and student references.
- 588 broad theme candidates need semantic review; counts alone do not justify deleting relations.
- Source LN01915 insofern is typed conjunction but tagged conjunctional adverb, alongside a separate C1 adverb teaching row. Resolve that source overlap before importing its pending sense.
- G24/W10/W11 remain genuinely empty in the enabled reviewed curriculum; optional recorded audio is unavailable.
- No live database data was changed. The guarded SQL and explicit CLI apply are prepared for review. Automatic approval review rejected automatic startup data repair because deployment would cause persistent database changes. No startup data repair or workaround was installed.

## Apply sequence and reproducibility

1. Review the report, JSON evidence and database/repairs/vocabulary-filter-20261009.sql. Validate on a staging copy using the actual MySQL/MariaDB version; no Hostinger operation was performed.
2. Apply migration 009 and the reviewed transaction **explicitly after approval**, before deploying the new Dictionary API queries. The prepared SQL includes the additive schema, named lock, InnoDB checks, exact-ID/sense/form/CEFR guards, rollback handler and checksum/version ledger. Repeating it returns already_applied. If any guard fails, regenerate/review against a fresh complete snapshot; do not weaken the guard.
3. Alternatively run the explicit Dictionary CLI with approved database environment variables: node tools/audit-vocabulary-filters.js --snapshot <complete-export.csv> --out <audit-directory> --apply. It re-reads and locks current data before applying and loads no .env file. No credentials belong in the report or shell history.
4. Deploy Dictionary API code, then Website filter code. Existing website student progress tables and stable IDs stay unchanged. Confirm the live facet counts and closed-class sets using a fresh post-apply export.

Read-only reproduction:

```powershell
node tools/audit-vocabulary-filters.js --snapshot 'C:/Users/sheik/Downloads/export (1).csv' --out import-work/filter-audit-20261009 --prepare-sql
$env:DICTIONARY_AUDIT_SNAPSHOT='C:/Users/sheik/Downloads/export (1).csv'
node --test tests/vocabulary-filter-audit.test.cjs
npm test
```

## Grammar reference checks

The learner-facing six modal verbs plus möchten convention and the Konjunktiv-II qualification follow [IDS modal verb grammar](https://grammis.ids-mannheim.de/systematische-grammatik/380) and [IDS möchten terminology](https://grammis.ids-mannheim.de/terminologie/155). Case nuances follow [IDS entlang](https://grammis.ids-mannheim.de/praepositionen/299312), [IDS bis/zu](https://grammis.ids-mannheim.de/fragen/3138), and [IDS two-way prepositions](https://grammis.ids-mannheim.de/sgt/2262). Complement patterns were checked against [IDS verb/preposition learner list](https://grammis.ids-mannheim.de/pdf/VmP-A2-Liste.pdf) and [IDS sagen](https://grammis.ids-mannheim.de/verbs/view/400841/2).

## Post-push compatibility correction (2026-10-10)

The pushed Dictionary queries originally required the optional migration-009 tables even for unfiltered listings. Deploying code before explicitly applying that migration caused the API to reject lists, exact-ID reads and facet requests; the portal then showed Auswahl nicht verfügbar. Readers now retry with the existing schema only for MySQL ER_NO_SUCH_TABLE/1146 naming vocabulary_learning_details, vocabulary_word_types or learning_word_types. Existing IDs, filters, forms and counts remain available. Partial migrations are covered; after an explicit apply the next request automatically uses the extended data. Base-table, access, transport and SQL-syntax errors still propagate. No table creation, taxonomy repair or live write occurs in compatibility reads. The portal now shows a useful failed-loading caption instead of leaving its default instructions. Ten compatibility tests cover SQL results and the authenticated HTTP API; full Dictionary suite: 207 passed. Portal vocabulary suite: 63 passed.

This compatibility correction restores availability; it does not apply the data repair or make missing grammar classifications complete. The explicit repair step remains necessary for the reviewed seven-modal and other complete learner sets. Live database logs were not accessed, so the screenshot's exact production failure is inferred from the reproduced dependency failure.

## Website catalogue implementation (2026-10-10)

The prior sections describe the Dictionary audit and its unapplied repair. Wortschatz now uses a Website-owned catalogue: all 12,252 original stable IDs are copied as lexical payloads; 113 guarded existing-ID repairs enable 2,612 learning entries. Modalverben now has 7, Akkusativ-Präpositionen 7, Dativ-Präpositionen 10 and Wechselpräpositionen 9 in this local catalogue. All 100 taxonomy filters execute against actual local rows; counts and complete evidence are in reports/local-vocabulary-catalogue-audit.json. Existing CEFR and student progress IDs are preserved.

Unlike the prepared full Dictionary repair, the Website release **does not create formal Sie**: the supplied snapshot has no assigned ID for it. Articles have six entries; pronouns have twelve enabled entries, including the seven existing personal pronouns and lowercase sie with she/they senses. Formal Sie is explicitly pending until the source assigns its stable ID. No completeness claim is made for that missing source entry. G24/W10/W11 remain genuinely empty.

Website learning reads no longer depend on Dictionary runtime availability. The committed seed serves until an administrator explicitly imports it into the Website DB; versioned transactional updates retain the last approved copy on failure. No live DB writes or Hostinger operation occurred. See docs/local-vocabulary-catalogue.md for deployment, admin import, synchronization, verification and limitations. Full Website checks passed, final vocabulary suite 88 tests and integration 2 tests; shared Dictionary tree 226 tests, including three new export tests. Browser QA exercised the actual local provider with Dictionary networking disabled.
