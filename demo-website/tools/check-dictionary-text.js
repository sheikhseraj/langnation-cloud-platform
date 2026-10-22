'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const text=require('../public/js/dictionary-text');
const paragraph='Farben machen das Leben bunt. Der Regenbogen besteht aus vielen Farben. Obst und Gemüse ist oft sehr farbig.';
for(const [word,expected] of [['Regenbogen','Der Regenbogen besteht aus vielen Farben.'],['Gemüse','Obst und Gemüse ist oft sehr farbig.']])test(`sentence containing ${word}`,()=>{
  const span=text.sentence(paragraph,paragraph.indexOf(word));assert.equal(span.text,expected);assert.equal(paragraph.slice(span.start,span.end),expected);
});
test('single tokens and manual phrases stay distinguishable',()=>{assert.equal(text.words('„Regenbogen,“').length,1);assert.equal(text.words('aus vielen Farben').length,3);assert.equal(text.words('E-Mail').length,1);assert.equal(text.normalize(' „Straße!“ '),'Straße');});
for(const paragraph of ['Er fragt: „Kommst du?“ Danach geht er.','Das ist schön! Danach gehen wir.','Sie hilft Dr. Müller. Er dankt ihr.','Es gibt z. B. rote Blumen. Danach kommt Blau.','Am 3. Oktober beginnt der Kurs. Danach ist frei.'])test(`German boundaries: ${paragraph}`,()=>{
  const word=paragraph.includes('Danach')?'Danach':'Er dankt';const span=text.sentence(paragraph,paragraph.indexOf(word));assert.equal(span.text,paragraph.slice(paragraph.indexOf(word)));assert.equal(text.sentence(paragraph,0).end,paragraph.indexOf(word)-1);
});

test('an abbreviation may end a sentence before an uppercase new sentence',()=>{const p='Wir lesen usw. Danach gehen wir.';assert.equal(text.sentence(p,p.indexOf('Danach')).text,'Danach gehen wir.');});
