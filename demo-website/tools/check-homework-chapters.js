"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=require('../lib/homework-engine');
const format=require('../lib/exercise-format');
const {build}=require('./build-homework-chapters');
const counts={8:58,10:71,11:51,12:48,13:39};
const chapters={};
function answers(q){
  if(q.type==='text_highlight')return [[...new Set(q.groups.flatMap(g=>g.tokens))]];
  if(q.type==='highlight_categorize')return [{tokens:q.groups.flatMap(g=>g.tokens),categories:Object.fromEntries(q.groups.map(g=>[g.id,g.category]))}];
  if(q.type==='categorize')return [Object.fromEntries(q.items.map(i=>[i.id,i.category]))];
  if(q.type==='multi_select')return [q.correctChoices.slice(0,q.selectCount)];
  return q.accepted;
}
for(const number of Object.keys(counts)){
  const generated=build(Number(number));
  const chapter=format.parse(fs.readFileSync(`content/homework/intensive-a1-b1/${generated.filename}`,'utf8')).learning;
  chapters[number]=chapter;
  test(`chapter ${number}: complete reproducible transcription, examples excluded`,()=>{
    assert.deepEqual(chapter,generated.chapter);assert.equal(engine.questions(chapter).length,counts[number]);
    assert.equal(engine.tally(chapter,engine.initial()).total,counts[number]);
    assert(chapter.sections.every(s=>s.examples.length&&s.questions.length));
  });
  for(const q of engine.questions(chapter))test(`${number}/${q.id}: all accepted variants and wrong answers`,()=>{
    for(const answer of answers(q)){assert(engine.hasAnswer(q,answer));assert(engine.evaluate(q,answer).correct,JSON.stringify(answer));}
    assert(!engine.evaluate(q,'definitely wrong').correct);
    assert(!engine.evaluate(q,null).correct);
  });
  test(`chapter ${number}: batch completion, restart, hints, reveal, JSON persistence and review`,()=>{
    let state=engine.initial();
    for(const section of chapter.sections){state=engine.transition(chapter,state,{action:'check-section',section:section.id,answers:Object.fromEntries(section.questions.map(q=>[q.id,answers(q)[0]]))});state=JSON.parse(JSON.stringify(state));}
    assert.equal(engine.tally(chapter,state).green,counts[number]);
    assert.equal(engine.tally(chapter,state).completed,counts[number]);
    const section=chapter.sections[0],q=section.questions[0];
    state=engine.transition(chapter,state,{action:'restart-section',section:section.id});
    assert.equal(engine.tally(chapter,state).open,section.questions.length);
    for(let n=0;n<2;n++)state=engine.transition(chapter,state,{action:'hint',question:q.id});
    state=engine.transition(chapter,state,{action:'reveal',question:q.id});
    state=engine.transition(chapter,state,{action:'check',question:q.id,answer:answers(q)[0]});assert.equal(state.items[q.id].status,'red');
    state=engine.transition(chapter,JSON.parse(JSON.stringify(state)),{action:'review'});
    state=engine.transition(chapter,state,{action:'check',question:q.id,answer:answers(q)[0]});assert.equal(state.items[q.id].status,'green');assert.equal(state.review,null);
  });
  test(`chapter ${number}: private answer keys are not sent to students`,()=>{
    const safe=engine.publicChapter(chapter,engine.initial());
    for(const q of engine.questions(safe))for(const field of ['accepted','groups','correctChoices','feedback','positions','solution'])assert.equal(q[field],undefined,`${q.id}/${field}`);
    for(const q of engine.questions(safe))assert.deepEqual(q.hints,[]);
  });
}
test('reading target positions preserve repeated words, overlaps and discontinuous forms',()=>{
  const q=(n,id)=>engine.questions(chapters[n]).find(q=>q.id===id);
  assert.deepEqual(q(8,'r1').groups.flatMap(g=>g.tokens),[10,13,21,29,31,45,47,48,57,63]);
  assert.deepEqual(q(8,'r2').groups.flatMap(g=>g.tokens),[7,19]);
  assert.equal(q(10,'r1').groups.length,20);
  assert.deepEqual(q(11,'r1').groups[3].tokens,[26,28]);assert.deepEqual(q(11,'r1').groups[4].tokens,[26,31]);
  assert.deepEqual(q(12,'r1').groups.map(g=>g.tokens),[[1],[7,11],[13,15],[17,24],[29],[30,37],[39,46],[49,54],[56],[62],[70,75]]);
  assert.deepEqual(q(13,'r1').groups.map(g=>g.tokens),[[3],[13],[19],[29],[43,45],[53,54,56,57],[61,66],[76]]);
});
test('any two distinct contractions accepted; duplicates, extra and invalid selections rejected',()=>{
  const q=engine.questions(chapters[10]).find(q=>q.id==='r4');
  for(const a of q.correctChoices)for(const b of q.correctChoices)assert.equal(engine.evaluate(q,[a,b]).correct,a!==b);
  for(const a of [['am'],['am','zur','zum'],['am','mit'],'am, zur'])assert(!engine.evaluate(q,a).correct);
});
test('all three subordinate conjunctions required, not one arbitrary alternative',()=>{
  const q=engine.questions(chapters[13]).find(q=>q.id==='r2');
  assert(engine.evaluate(q,['wenn','weil','obwohl']).correct);
  assert(!engine.evaluate(q,['weil']).correct);assert(!engine.evaluate(q,['weil','obwohl','aber']).correct);
});
test('paired sentences are atomic; partial, inverted and extra fields rejected',()=>{
  const q=engine.questions(chapters[13]).find(q=>q.id==='18'),a=q.accepted[0];
  for(const value of [a.slice(0,1),[a[1],a[0]],[...a,'extra'],[a[0],'wrong']])assert(!engine.evaluate(q,value).correct);
  assert(!engine.hasAnswer(q,[a[0],'']));
});
test('highlight and classification both required for one countable task',()=>{
  const q=engine.questions(chapters[12]).find(q=>q.id==='r1'),answer=answers(q)[0];
  assert(!engine.evaluate(q,{...answer,tokens:answer.tokens.slice(1)}).correct);
  assert(!engine.evaluate(q,{...answer,categories:{...answer.categories,'group-1':'Perfekt'}}).correct);
  assert(!engine.evaluate(q,{...answer,categories:{...answer.categories,extra:'Perfekt'}}).correct);
  assert(!engine.evaluate(q,{tokens:[],categories:{}}).correct);
});
test('chapter 09 and all new chapters appear in numeric library order',()=>{
  const library=require('../lib/exercises').library();
  const titles=library.filter(c=>/Kapitel (08|09|10|11|12|13) —/.test(c.title)&&!/^A[12]|^B1/.test(c.title)).map(c=>c.title.match(/Kapitel (\d+)/)[1]);
  assert.deepEqual(titles,['08','09','10','11','12','13']);
});
