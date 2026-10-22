'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{grammar}=require('../public/js/dictionary-presentation');
test('noun shows only its plural',()=>assert.equal(grammar({partOfSpeech:'noun',plural:'die Farben',nounForms:{article:'die',plural_en:'colors'},verbForms:{perfekt:'hat gemacht'}}),'Plural: die Farben'));
test('verb uses stored third-person forms from JSON conjugation arrays',()=>assert.equal(grammar({partOfSpeech:'verb',verbForms:{praeteritum:'["machte","machtest","machte","machten"]',perfekt:['habe gemacht','hast gemacht','hat gemacht'],auxiliary:'haben',partizip2:'gemacht',base_en:'do'}}),'Präteritum: machte · Perfekt: hat gemacht'));
test('standalone principal parts work without a forms table',()=>assert.equal(grammar({partOfSpeech:'verb',praeteritum:'ging',perfekt:'ist gegangen'}),'Präteritum: ging · Perfekt: ist gegangen'));
test('adjective shows stored comparison forms only',()=>assert.equal(grammar({partOfSpeech:'adjective',adjectiveForms:{komparativ_de:'schöner',superlativ_de:'am schönsten',positive_en:'beautiful'}}),'Komparativ: schöner · Superlativ: am schönsten'));
test('adverbs do not acquire invented comparison data',()=>{assert.equal(grammar({partOfSpeech:'adverb',headword:'schnell'}),'');assert.equal(grammar({partOfSpeech:'adverb',adjectiveForms:{komparativ_de:'schneller'}}),'Komparativ: schneller');});
test('missing, malformed and empty data never produces empty labels or raw objects',()=>{
 for(const entry of [{partOfSpeech:'noun',plural:' '},{partOfSpeech:'verb',verbForms:{praeteritum:'[bad',perfekt:[null,null,null]}},{partOfSpeech:'adjective',adjectiveForms:{komparativ_de:'—',superlativ_de:{}}},{partOfSpeech:'verb',verbForms:{praeteritum:['machte']}}])assert.equal(grammar(entry),'');
 assert.equal(grammar({partOfSpeech:'verb',perfekt:'er hat gemacht'}),'Perfekt: hat gemacht');
});
test('other real dictionary types do not leak unrelated metadata',()=>{
 for(const type of ['pronoun','preposition','conjunction','article','numeral','particle','interjection','phrase','expression','custom-type'])assert.equal(grammar({partOfSpeech:type,plural:'wrong',nounForms:{article:'der'},verbForms:{perfekt:'wrong'}}),'');
});
