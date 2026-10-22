"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const engine=require('../lib/homework-engine');
const fmt=require('../lib/exercise-format');
const chapter=fmt.parse(fs.readFileSync('content/homework/intensive-a1-b1/09-negation.txt','utf8')).learning;
const all=engine.questions(chapter),question=id=>all.find(q=>q.id===id);
const step=(state,action,id,answer)=>engine.transition(chapter,state,{action,question:id,answer});
test('content covers every specified task, examples are not counted',()=>{
  assert.equal(chapter.sections.length,8);assert.equal(all.length,45);
  assert.equal(new Set(all.map(q=>q.type)).size,10);
  assert.equal(engine.tally(chapter,engine.initial()).total,45);
  assert.equal(chapter.sections[0].questions[6].prompt,'Ich kenne dort ___ Mann.');
  assert.equal(question('14').prompt,'Wegen ___ Fehlers wurde der Termin verschoben. (Gen., m.; formell)');
  assert.equal(question('reading-1').groups.length,11);
  assert.equal(question('reading-1').groups.filter(g=>g.tokens.length>1).length,4);
});
test('normalization preserves umlauts, spelling, internal punctuation; allows NFC, spaces and final punctuation',()=>{
  assert.equal(engine.normalize('  scho\u0308n  ist   es!? '),'schön ist es');
  assert.equal(engine.evaluate(question('33'),'  Das ist kein Hotel,   sondern ein Büro! ').correct,true);
  assert.equal(engine.evaluate(question('33'),'Das ist kein Hotel, sondern ein Buro.').correct,false);
  assert.equal(engine.evaluate(question('33'),'Das ist kein Hotel sondern ein Büro.').correct,false);
  assert.equal(engine.evaluate(question('35'),'ich habe kein geld').orthography,true);
  assert.equal(engine.evaluate(question('21'),'Niemand').orthography,false);
  assert.equal(engine.evaluate(question('21'),'niemand').orthography,true);
});
for(const q of all){
  test(`question ${q.id}: every accepted variant and wrong answer`,()=>{
    const answers=q.type==='insert_word'?q.positions:q.type==='text_highlight'?[q.groups.flatMap(g=>g.tokens)]:q.type==='categorize'?[Object.fromEntries(q.items.map(i=>[i.id,i.category]))]:q.accepted;
    for(const answer of answers)assert.equal(engine.evaluate(q,answer).correct,true,JSON.stringify(answer));
    assert.equal(engine.evaluate(q,'definitely wrong').correct,false);
  });
}
test('linked blanks are one atomic question; extra or missing blanks fail',()=>{
  const q=question('30');assert(engine.evaluate(q,['keinen','mehr']).correct);
  for(const a of [['keinen'],['keinen','nicht'],['keinen','mehr','extra'],'keinen mehr'])assert(!engine.evaluate(q,a).correct);
});
test('insertion rejects wrong slot and untyped indexes',()=>{
  assert(engine.evaluate(question('17'),0).correct);
  assert(!engine.evaluate(question('17'),'0').correct);
  assert(!engine.evaluate(question('15'),0).correct);
});
test('highlighting distinguishes repeated words, grouped expressions and extra tokens',()=>{
  const q=question('reading-1'),tokens=q.groups.flatMap(g=>g.tokens);
  assert(!engine.evaluate(q,tokens.slice(1)).correct);
  assert(!engine.evaluate(q,[...tokens,0]).correct);
  assert.equal(new Set(q.groups.filter(g=>g.label.startsWith('nicht (')).map(g=>g.tokens[0])).size,3);
  assert(!engine.evaluate(question('reading-2'),{}).correct);
});
test('reading fragments get yellow feedback but remain incomplete',()=>{
  for(const [id,a] of [['reading-3','auf seine E-Mails geantwortet'],['reading-4','Kaffee']]){
    const state=step(engine.initial(),'check',id,a);
    assert(state.items[id].result.partial);assert(!state.items[id].completed);assert.equal(state.items[id].status,'red');
  }
  assert(!engine.evaluate(question('reading-4'),'Es gibt Tee und Kaffee.').partial);
});
test('independent, hinted, revealed, reproduced, reviewed transitions persist correctly',()=>{
  let s=step(engine.initial(),'check','1','kein');assert.equal(s.items['1'].status,'green');assert(s.items['1'].firstTryCorrect);
  s=step(s,'hint','2');s=step(s,'check','2','nicht');assert.equal(s.items['2'].status,'yellow');
  assert.throws(()=>step(s,'reveal','3'));
  s=step(s,'check','3','kein');s=step(s,'check','3','keine');s=step(s,'reveal','3');assert(!s.items['3'].completed);
  s=step(s,'check','3','keinen');assert.equal(s.items['3'].status,'red');assert(s.items['3'].completed);
  s=step(s,'review');assert.deepEqual(s.review.queue,['2','3']);
  let pub=engine.publicChapter(chapter,s);assert.deepEqual(pub.sections[0].questions[1].hints,[]);assert.equal(pub.sections[0].questions[2].solution,undefined);
  s=JSON.parse(JSON.stringify(s));s=step(s,'check','3','keinen');assert.equal(s.items['3'].status,'green');assert.equal(s.items['3'].attempts,4);assert.equal(s.items['3'].firstTryCorrect,false);
  s=step(s,'hint','2');s=step(s,'check','2','nicht');assert.equal(s.items['2'].status,'yellow');assert.equal(s.review,null);
  s=step(s,'review');s=step(s,'check','2','nicht');assert.equal(s.items['2'].status,'green');assert.equal(s.review,null);
});
test('two hints unlock reveal; reveal in review requires reproduction and another review to upgrade',()=>{
  let s=step(engine.initial(),'hint','1');s=step(s,'hint','1');s=step(s,'reveal','1');
  assert.equal(engine.tally(chapter,s).completed,0);
  assert.throws(()=>step(s,'review'));
  s=step(s,'check','1','kein');
  s=step(s,'review');s=step(s,'hint','1');s=step(s,'hint','1');s=step(s,'reveal','1');
  s=step(s,'check','1','kein');assert.equal(s.items['1'].status,'red');assert.equal(s.review,null);
  s=step(s,'review');s=step(s,'check','1','kein');assert.equal(s.items['1'].status,'green');
});
test('draft, page and review are resumable without counting drafts as attempts',()=>{
  let s=step(engine.initial(),'draft','30',['keinen','']);assert.equal(s.items['30'].attempts,0);
  s=engine.transition(chapter,s,{action:'page',page:4});assert.equal(s.page,4);
  s=step(s,'check','30',['keinen','nicht']);s=step(s,'review');s=step(s,'hint','30');
  const restored=JSON.parse(JSON.stringify(s));assert.equal(restored.review.items['30'].hintLevel,1);assert.equal(restored.page,4);
  assert.throws(()=>step(s,'check','1','kein'));
});
test('answer keys, unearned hints and scaffolds never reach student config',()=>{
  const initial=JSON.stringify(engine.publicChapter(chapter,engine.initial()));
  for(const key of ['accepted','positions','groups','fragments','feedback','skeleton','builderWords','wordBank'])assert(!initial.includes('"'+key+'"'));
  let s=step(engine.initial(),'check','31','wrong');s=step(s,'check','31','wrong');
  assert(engine.publicChapter(chapter,s).sections[5].questions[0].builderWords);
  s=step(s,'hint','31');assert.equal(engine.publicChapter(chapter,s).sections[5].questions[0].hints.length,1);
});
test('malformed structured editor input fails before save',()=>{
  assert.equal(fmt.parse('# X\n@learning\n{}').questions.length,0);
  const c=structuredClone(chapter);c.sections[0].questions[1].id='1';assert.throws(()=>engine.validate(c));
});
test('persistence binds owner + exercise, locks, detects stale writes, and round-trips state',async()=>{
  const db=require('../lib/db'),progress=require('../lib/homework-progress');
  const old={transaction:db.transaction,hasColumn:db.hasColumn,queryOne:db.queryOne};
  let stored=JSON.stringify(engine.initial()),authorized=true;
  const tx={queryOne:async(sql,binds)=>{assert(sql.includes('FOR UPDATE'));assert.deepEqual(binds,[7,5,99]);return authorized?{learning_state:stored}:null;},query:async(sql,binds)=>{assert(sql.startsWith('UPDATE exercise_attempts'));stored=binds[0];}};
  db.hasColumn=()=>true;db.transaction=async fn=>fn(tx);
  try{
    const ex={id:99,learning:chapter};
    let result=await progress.update(ex,5,{attempt:7,revision:0,action:'hint',question:'1'});assert.equal(result.state.items['1'].hintLevel,1);
    db.queryOne=async(sql,binds)=>{assert.deepEqual(binds,[7,5,99]);return {learning_state:stored};};
    assert.equal((await progress.read(7,5,99)).items['1'].hintLevel,1);
    result=await progress.update(ex,5,{attempt:7,revision:0,action:'hint',question:'1'});assert.equal(result.code,409);
    authorized=false;result=await progress.update(ex,5,{attempt:7,revision:1,action:'hint',question:'1'});assert.equal(result.code,404);
  }finally{Object.assign(db,old);}
});
test('real HTTP routes enforce sign-in, chapter access and attempt ownership',async()=>{
  const express=require('express'),db=require('../lib/db'),students=require('../lib/students'),portal=require('../lib/portal'),exercises=require('../lib/exercises');
  const saved={enabled:db.isEnabled,current:students.current,profile:portal.profile,forStudent:exercises.forStudent,queryOne:db.queryOne,transaction:db.transaction,hasColumn:db.hasColumn};
  let signedIn=true,access=true,owner=true,stored=JSON.stringify(engine.initial());
  db.isEnabled=()=>true;students.current=async()=>signedIn?{id:5,email:'fixture@example.test',name:'Fixture'}:null;portal.profile=async()=>null;
  exercises.forStudent=async(id,studentId,email)=>{assert.equal(studentId,5);assert.equal(email,'fixture@example.test');return access?{id:Number(id),learning:chapter}:null;};
  db.hasColumn=()=>true;db.transaction=async fn=>fn({queryOne:async(sql,binds)=>owner&&binds[0]===7&&binds[1]===5&&binds[2]===99?{learning_state:stored}:null,query:async(sql,binds)=>{stored=binds[0];}});
  const app=express();app.use('/portal',require('../routes/student').build());
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url=`http://127.0.0.1:${server.address().port}/portal/homework/99/check`;
  const post=(body,headers={})=>fetch(url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Accept:'application/json',...headers},body:JSON.stringify(body)});
  const command={attempt:7,revision:0,action:'check',question:'1',answer:'kein'};
  try{
    signedIn=false;assert.equal((await post(command)).status,302);signedIn=true;
    access=false;assert.equal((await post(command)).status,404);access=true;
    owner=false;assert.equal((await post(command)).status,404);owner=true;
    assert.equal((await post(command,{'sec-fetch-site':'cross-site'})).status,403);
    const response=await post(command);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const result=await response.json();assert.equal(result.state.items['1'].status,'green');assert(!JSON.stringify(result.chapter).includes('"accepted"'));
    assert.equal((await post(command)).status,409);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    db.isEnabled=saved.enabled;students.current=saved.current;portal.profile=saved.profile;exercises.forStudent=saved.forStudent;db.queryOne=saved.queryOne;db.transaction=saved.transaction;db.hasColumn=saved.hasColumn;
  }
});
test('migration is registered as schema-only and does not rewrite historical answers',()=>{
  const migration=fs.readFileSync('MySQL/36_homework_learning.sql','utf8');
  assert.equal(require('../lib/migrate').classify(migration),'schema');
  assert(!/DELETE|DROP TABLE|UPDATE .* SET/i.test(migration));
});
test('upgrading a chapter starts a learning attempt without changing historical scores or answers',async()=>{
  const db=require('../lib/db'),progress=require('../lib/homework-progress');
  const old={transaction:db.transaction,hasColumn:db.hasColumn};
  const writes=[];db.hasColumn=()=>true;
  db.transaction=async fn=>fn({queryOne:async sql=>sql.includes('FROM exercises')?{id:99}:sql.includes('FROM exercise_attempts')?{id:6,attempt:2,finished_at:'2026-01-01',learning_state:null}:{n:4},query:async(sql,binds)=>{writes.push({sql,binds});return {insertId:7};}});
  try{
    const result=await progress.ensureAttempt({id:99,learning:chapter},5);assert.equal(result.id,7);assert.equal(result.attempt,3);
    assert.equal(writes.length,1);assert(writes[0].sql.startsWith('INSERT INTO exercise_attempts'));assert.equal(writes[0].binds[3],45);
  }finally{Object.assign(db,old);}
});

test('checking preference persists and only accepts the two supported modes',()=>{
  let s=engine.transition(chapter,engine.initial(),{action:'mode',mode:'end'});
  s=JSON.parse(JSON.stringify(s));assert.equal(s.checkMode,'end');assert.equal(s.revision,1);
  assert.equal(engine.tally(chapter,s).open,45);
  assert.throws(()=>engine.transition(chapter,s,{action:'mode',mode:'invalid'}));
});
test('check-section grades filled answers atomically, leaves blanks open, and rejects foreign questions',()=>{
  const initial=engine.initial();
  const s=engine.transition(chapter,initial,{action:'check-section',section:'exercise-1',answers:{'1':'kein','2':'kein','3':'','4':null}});
  assert.equal(s.revision,1);assert.equal(s.items['1'].status,'green');assert.equal(s.items['2'].status,'red');
  assert.equal(s.items['3'],undefined);assert.equal(s.items['4'],undefined);assert.deepEqual(initial.items,{});
  assert.throws(()=>engine.transition(chapter,s,{action:'check-section',section:'exercise-1',answers:{'9':'keinen'}}));
  assert.throws(()=>engine.transition(chapter,s,{action:'check-section',section:'unknown',answers:{}}));
  const linked=engine.transition(chapter,s,{action:'check-section',section:'exercise-5',answers:{'30':['keinen','mehr']}});
  assert.equal(linked.items['30'].status,'green');
});
test('restart clears the whole current section and preserves other sections, checking mode and historical analytics',()=>{
  let s=step(engine.initial(),'check','1','wrong');s=step(s,'check','1','kein');s=step(s,'hint','2');s=step(s,'check','9','keinen');
  s=engine.transition(chapter,s,{action:'mode',mode:'end'});
  const before=structuredClone(s);
  s=engine.transition(chapter,s,{action:'restart-section',section:'exercise-1'});
  for(const q of chapter.sections[0].questions)assert.deepEqual(s.items[q.id],engine.initialItem());
  assert.deepEqual(s.items['9'],before.items['9']);assert.equal(s.checkMode,'end');assert.equal(s.page,0);
  assert.equal(s.restarts['exercise-1'].lastItems['1'].attempts,2);assert.equal(s.analytics['1'].firstTryCorrect,false);
  s=step(s,'check','1','kein');assert.equal(s.items['1'].status,'green');assert.equal(s.analytics['1'].firstTryCorrect,false);
  s=engine.transition(chapter,s,{action:'restart-section',section:'exercise-1'});assert.equal(s.restarts['exercise-1'].count,2);
  assert.throws(()=>engine.transition(chapter,s,{action:'restart-section',section:'unknown'}));
});
test('restart exits review without resetting another section',()=>{
  let s=step(engine.initial(),'hint','1');s=step(s,'check','1','kein');s=step(s,'check','9','bad');s=step(s,'review');
  s=engine.transition(chapter,s,{action:'restart-section',section:'exercise-1'});
  assert.equal(s.review,null);assert.equal(s.items['9'].status,'red');assert.equal(s.items['1'].status,'open');
});
test('reading feedback identifies right selections, wrong selections and incomplete linked groups without revealing missing words',()=>{
  const q=question('reading-1'),single=q.groups[0].tokens,linked=q.groups.find(g=>g.tokens.length>1);
  const feedback=engine.evaluate(q,[...single,linked.tokens[0],0]);
  assert.equal(feedback.details.groups[0].complete,true);
  const part=feedback.details.groups.find(g=>g.id===linked.id);assert.equal(part.complete,false);assert.deepEqual(part.selected,[linked.tokens[0]]);
  assert.deepEqual(feedback.details.extra,[0]);assert(!Object.hasOwn(part,'tokens'));
});
