"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const reading=require('../lib/reading-content'),engine=require('../lib/homework-engine'),fmt=require('../lib/exercise-format');
const pilot=JSON.parse(fs.readFileSync('content/reading/a1-die-farben.json','utf8'));
const chapter=reading.chapter(pilot),clone=()=>structuredClone(pilot);
test('pilot uses the canonical renderer, with all twenty options and the source answer key',()=>{
  assert.equal(chapter.sections[0].questions.length,5);assert.equal(pilot.exercises.flatMap(q=>q.options).length,20);
  assert.deepEqual(pilot.exercises.map(q=>q.answerKey.correctOptionIds[0]),['a','c','c','d','a']);
  assert.equal(fmt.parse(reading.library()[0].source).learning.module,'reading');
  for(const level of reading.LEVELS){const p=clone();p.meta.cefrLevel=level;assert.equal(reading.chapter(p).meta.cefrLevel,level);}
});
for(const [label,alter]of [
  ['missing key',p=>delete p.exercises[0].answerKey],['dangling option',p=>p.exercises[0].answerKey.correctOptionIds=['z']],
  ['duplicate options',p=>p.exercises[0].options[1].id='a'],['duplicate question',p=>p.exercises[1].id='q1'],
  ['duplicate position',p=>p.exercises[1].position=1],['bad support',p=>p.exercises[0].support.blockId='missing'],
  ['empty prompt',p=>p.exercises[0].prompt=''],['unsafe image',p=>p.presentation.coverImage='javascript:alert(1)'],
  ['unapproved typed answer',p=>{p.exercises[0].type='short_answer';p.exercises[0].answerKey={acceptedAnswers:[]};}]
])test('publication rejects '+label,()=>{const p=clone();alter(p);assert.throws(()=>reading.validate(p));});
test('MCQ multiple selection requires the exact complete set',()=>{const q=structuredClone(chapter.sections[0].questions[0]);q.answerKey.correctOptionIds=['a','b'];for(const [a,good]of [[['a','b'],true],[['b','a'],true],[['a'],false],[['a','a'],false],[['a','b','c'],false]])assert.equal(engine.evaluate(q,a).correct,good);});
test('typed variants use configured normalization, preserve umlauts and reject guessed synonyms',()=>{
  const q={readingQuestion:true,type:'short_answer',answerKey:{acceptedAnswers:['weiß','Schnee und Wolken'],normalization:{normalizeUnicode:true,trimWhitespace:true,caseSensitive:false,ignoreFinalPunctuation:true}},feedback:{correct:'Yes',incorrect:'No'}};
  for(const a of [' Weiß! ','schnee und wolken.'])assert(engine.evaluate(q,a).correct);
  for(const a of ['weiss','Schnee','weißlich'])assert(!engine.evaluate(q,a).correct);
  q.answerKey.normalization.caseSensitive=true;assert(!engine.evaluate(q,'Weiß').correct);
  const tf={...q,type:'true_false',answerKey:{correct:false}};assert(engine.evaluate(tf,false).correct);assert(!engine.evaluate(tf,'false').correct);
});
test('wrong answers never complete Lesen; hints, support, retry and restart preserve honest analytics',()=>{
  let s=engine.initial();for(const q of chapter.sections[0].questions)s=engine.transition(chapter,s,{action:'check',question:q.id,answer:'wrong'});
  assert.equal(engine.tally(chapter,s).completed,0);assert.equal(engine.tally(chapter,s).done,false);
  s=engine.transition(chapter,s,{action:'hint',question:'q1'});assert.equal(s.items.q1.hintLevel,1);
  assert.throws(()=>engine.transition(chapter,s,{action:'support',question:'q1'}));
  s=engine.transition(chapter,s,{action:'check',question:'q1',answer:'b'});s=engine.transition(chapter,s,{action:'support',question:'q1'});
  assert.equal(engine.publicChapter(chapter,s).sections[0].questions[0].support.blockId,'p1');
  for(const q of chapter.sections[0].questions)s=engine.transition(chapter,s,{action:'check',question:q.id,answer:q.answerKey.correctOptionIds[0]});
  assert(engine.tally(chapter,s).done);assert.equal(engine.tally(chapter,s).firstTry,0);assert.equal(s.history.length,11);
  const restored=JSON.parse(JSON.stringify(s));assert(engine.tally(chapter,restored).done);
  s=engine.transition(chapter,s,{action:'restart-section',section:'reading'});assert(!engine.tally(chapter,s).done);assert.equal(s.analytics.q1.firstTryCorrect,false);assert.equal(s.history.length,11);
});
test('public lesson data strips keys, explanations, support and unearned hints',()=>{
  const safe=JSON.stringify(engine.publicChapter(chapter,engine.initial()));
  for(const secret of ['answerKey','correctOptionIds','acceptedAnswers','supportAnchorText',pilot.exercises[0].hints[0]])assert(!safe.includes(secret));
  assert.equal(engine.publicChapter(chapter,engine.initial()).sections[0].questions[0].options.length,4);
});
test('optional questions do not prevent completion',()=>{const c=structuredClone(chapter);c.sections[0].questions[4].required=false;let s=engine.initial();for(const q of c.sections[0].questions.slice(0,4))s=engine.transition(c,s,{action:'check',question:q.id,answer:q.answerKey.correctOptionIds[0]});assert(engine.tally(c,s).done);});

test('configured reveal threshold is authoritative',()=>{const c=structuredClone(chapter);c.exerciseSettings.revealSupportAfterAttempts=1;let s=engine.initial();assert.throws(()=>engine.transition(c,s,{action:'reveal',question:'q1'}));s=engine.transition(c,s,{action:'check',question:'q1',answer:'invalid'});s=engine.transition(c,s,{action:'reveal',question:'q1'});assert(s.items.q1.solutionShown);});
test('invalid reveal thresholds and incomplete schemas are rejected',()=>{const data=structuredClone(pilot);data.exerciseSettings.revealSupportAfterAttempts=-1;assert.throws(()=>require('../lib/reading-content').validate(data));const db=require('../lib/db'),old=db.hasColumn;try{db.hasColumn=c=>c!=='exercises.available_until';assert(!require('../lib/reading-schema').ready());db.hasColumn=()=>true;assert(require('../lib/reading-schema').ready());}finally{db.hasColumn=old;}});
test('reading schema migration is additive and classified for the existing runner',()=>{const sql=fs.readFileSync('MySQL/37_reading_learning.sql','utf8');assert.equal(require('../lib/migrate').classify(sql),'schema');assert(!/DROP TABLE|DELETE FROM/i.test(sql));assert(sql.includes('unique_student_word'));});
test('shared queries retain enrollment, explicit access, module and availability constraints',async()=>{
  const db=require('../lib/db'),ex=require('../lib/exercises');const saved={query:db.query,queryOne:db.queryOne,hasColumn:db.hasColumn,isEnabled:db.isEnabled};const calls=[];
  db.isEnabled=()=>true;db.hasColumn=()=>true;db.query=async(sql,binds)=>{calls.push({sql,binds});return [];};db.queryOne=async(sql,binds)=>{calls.push({sql,binds});return null;};
  try{await ex.forStudentList(7,'a@example.test','reading');await ex.forStudent(12,7,'a@example.test','reading');for(const call of calls.filter(c=>c.sql.includes('FROM exercises e'))){assert(call.sql.includes("e.module = 'reading'"));assert(call.sql.includes('UTC_TIMESTAMP()'));assert(call.sql.includes('FIND_IN_SET'));assert(call.sql.includes("en.status = 'active'"));assert(call.binds.includes(7));}}
  finally{Object.assign(db,saved);}
});
test('CSRF validates token, rejects cross-site and malformed Unicode safely',()=>{const c=require('../lib/csrf');const t='a'.repeat(64);const req=(token,site)=>({cookies:{ln_csrf:t},body:{_csrf:token},get:key=>key==='sec-fetch-site'?site:undefined});assert(c.valid(req(t)));assert(!c.valid(req(t,'cross-site')));assert(!c.valid(req('é'.repeat(64))));assert(!c.valid(req('')));});

test('Homework assignment discovery excludes same-title reading assignments',async()=>{const db=require('../lib/db'),ex=require('../lib/exercises'),old={query:db.query,hasColumn:db.hasColumn,isEnabled:db.isEnabled};let sql='';db.isEnabled=()=>true;db.hasColumn=()=>true;db.query=async q=>{sql=q;return [];};try{await ex.given([{id:'collision',title:'Die Farben'}]);assert(sql.includes("module = 'homework'"));}finally{Object.assign(db,old);}});
test('vocabulary writes and deletion always bind authenticated ownership',async()=>{
  const db=require('../lib/db'),v=require('../lib/student-vocabulary'),old=db.query,calls=[];db.query=async(sql,binds)=>{calls.push({sql,binds});return [];};
  try{await v.save(7,{id:'vocabulary:2',headword:'weiß',meanings:[{text:'white'}]},{exerciseId:1,selection:'weiß'});await v.list(7);await v.remove(7,8);assert(calls[0].sql.includes('ON DUPLICATE KEY'));assert.equal(calls[0].binds[0],7);assert(calls[2].sql.includes('student_id = ?'));assert.deepEqual(calls[2].binds,[8,7]);}finally{db.query=old;}
});
test('Lesen student views render escaped content without exposing answer keys',async()=>{
  const ejs=require('ejs'),site=require('../lib/site');const common={site,student:{id:7,name:'Test'},avatarUrl:'',initials:'T',hue:0,nav:'lesen',notice:null,error:null};
  const html=await ejs.renderFile(path.resolve('views/pages/portal/reading.ejs'),{...common,ex:{id:1,level:'A1'},chapter:engine.publicChapter(chapter,engine.initial()),state:engine.initial(),attempt:1,csrf:'a'.repeat(64),nextLesson:null,savedCount:0});
  assert(html.includes('reading-passage'));assert(!html.includes('correctOptionIds'));assert(html.includes('dictionary-panel'));assert(html.includes('Die Farben'));
});
test('real reading HTTP routes require access, CSRF and the owning attempt',async()=>{
  const express=require('express'),cookieParser=require('cookie-parser'),db=require('../lib/db'),ex=require('../lib/exercises'),progress=require('../lib/homework-progress');
  const saved={hasColumn:db.hasColumn,forStudent:ex.forStudent,update:progress.update};db.hasColumn=()=>true;
  ex.forStudent=async(id,user,email,module)=>{assert.equal(module,'reading');return Number(id)===1?{id:1,learning:chapter}:null;};
  progress.update=async(ex,user,body)=>user===7&&body.attempt===3?{ok:true}:{error:'Attempt unavailable',code:404};
  const app=express();app.use(express.json(),cookieParser());const router=express.Router();require('../routes/reading').register(router,{requireStudent:(req,res,next)=>{if(!req.get('x-test-user'))return res.sendStatus(401);req.student={id:7,email:'a@example.test'};next();},fullStudent:async()=>({id:7}),shell:()=>({}),view:()=>{}});app.use('/portal',router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const url='http://127.0.0.1:'+server.address().port;
  const token='a'.repeat(64);const headers={'Content-Type':'application/json','x-test-user':'7',cookie:'ln_csrf='+token,'x-csrf-token':token};
  try{for(const [id,h,body,expected]of [[1,{}, {},401],[1,{'x-test-user':'7'}, {},403],[2,headers,{attempt:3},404],[1,headers,{attempt:99},404],[1,headers,{attempt:3},200]]){const r=await fetch(url+'/portal/lesen/'+id+'/check',{method:'POST',headers:h,body:JSON.stringify(body)});assert.equal(r.status,expected);}}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.hasColumn=saved.hasColumn;ex.forStudent=saved.forStudent;progress.update=saved.update;}
});

test('reading question navigation persists independently of answers and rejects invalid positions',()=>{let s=engine.initial();s=engine.transition(chapter,s,{action:'draft',question:'q1',answer:'b'});s=engine.transition(chapter,s,{action:'reading-position',position:3});assert.equal(s.readingQuestion,3);assert.equal(s.items.q1.answer,'b');assert(!engine.tally(chapter,s).done);assert.throws(()=>engine.transition(chapter,s,{action:'reading-position',position:5}));s=engine.transition(chapter,s,{action:'restart-section',section:'reading'});assert.equal(s.readingQuestion,0);});

test('dictionary saves question and homework vocabulary with CSRF and assignment access enforced',async()=>{
  const express=require('express'),cookies=require('cookie-parser'),db=require('../lib/db'),ex=require('../lib/exercises'),dict=require('../lib/dictionary-client'),vocab=require('../lib/student-vocabulary');
  const saved={column:db.hasColumn,access:ex.forStudent,lookup:dict.lookup,allowed:dict.allowed,save:vocab.save,list:vocab.list};const writes=[],access=[];
  db.hasColumn=()=>true;ex.forStudent=async(id,user,email,module)=>{access.push({id,user,module});return Number(id)===1?{id:1,learning:module==='reading'?chapter:undefined}:null;};
  dict.allowed=()=>true;dict.lookup=async()=>({results:[{id:'vocabulary:2',headword:'Frage',meanings:[{text:'question'}]}]});vocab.save=async(user,entry,source)=>writes.push({user,entry,source});vocab.list=async()=>[];
  const app=express();app.use(express.json(),cookies());const router=express.Router();require('../routes/reading').register(router,{requireStudent:(req,res,next)=>{if(!req.get('x-test-user'))return res.sendStatus(401);req.student={id:7,email:'test@example.test'};next();},fullStudent:async()=>({id:7}),shell:()=>({}),view:()=>{}});app.use('/portal',router);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url='http://127.0.0.1:'+server.address().port+'/portal/vocabulary';
  const headers={'Content-Type':'application/json','x-test-user':'7',cookie:'ln_csrf='+'a'.repeat(64),'x-csrf-token':'a'.repeat(64)};
  const body={exerciseId:1,entryId:'vocabulary:2',selection:'Frage',context:'Lies die Frage.'};
  try{
    for(const module of ['reading','homework'])assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({...body,module})})).status,200);
    assert.deepEqual(access.map(a=>a.module),['reading','homework']);assert(writes.every(w=>w.user===7&&w.source.exerciseId===1&&w.source.context==='Lies die Frage.'));
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({...body,exerciseId:null,module:'homework'})})).status,200);assert.equal(writes[2].source.exerciseId,null);
    for(const [change,status] of [[{exerciseId:999,module:'homework'},404],[{module:'admin'},400],[{context:'x'.repeat(1001)},400],[{entryId:'vocabulary:999'},400]])assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({...body,...change})})).status,status);
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-test-user':'7'},body:JSON.stringify(body)})).status,403);
    assert.equal(writes.length,3);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.hasColumn=saved.column;ex.forStudent=saved.access;dict.lookup=saved.lookup;dict.allowed=saved.allowed;vocab.save=saved.save;vocab.list=saved.list;}
});

test('reading library renders multiple separate lesson cards and preserves filters',async()=>{const ejs=require('ejs'),site=require('../lib/site');const items=[1,2,3].map(id=>({id,title:'Reading '+id,level:id===3?'B1':'A1',is_required:1,total:5,completed:0}));const html=await ejs.renderFile(path.resolve('views/pages/portal/lesen.ejs'),{site,student:{id:7,name:'Test'},avatarUrl:'',initials:'T',hue:0,nav:'lesen',notice:null,error:null,items,all:items,filters:{level:'',course:''}});for(const id of [1,2,3])assert(html.includes('/portal/lesen/'+id));assert.equal((html.match(/class="reading-lesson-card"/g)||[]).length,3);assert(html.includes('name="level"'));assert(html.includes('name="course"'));});

test('RootAdmin preview reuses real reader and grading without database writes',async()=>{
 const express=require('express'),cookies=require('cookie-parser'),crypto=require('crypto'),db=require('../lib/db');
 const old={query:db.query,queryOne:db.queryOne,hasColumn:db.hasColumn},secret=process.env.SESSION_SECRET;process.env.SESSION_SECRET='reading-preview-test-secret';
 db.hasColumn=()=>true;db.query=async()=>{throw Error('Preview must not write or list student work');};db.queryOne=async(sql,params)=>Number(params[0])===1?{id:1,module:'reading',source:reading.library()[0].source,title:chapter.title,level:'A1'}:null;
 const app=express();app.set('views',path.resolve('views'));app.set('view engine','ejs');app.use(express.json(),cookies());app.use('/rootadmin/lesen',require('../routes/rootadmin').build({module:'reading'}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const url='http://127.0.0.1:'+server.address().port+'/rootadmin/lesen/exercise/1/preview';const expiry=String(Date.now()+60000),signed=expiry+'.'+crypto.createHmac('sha256',process.env.SESSION_SECRET).update(expiry).digest('hex');const token='a'.repeat(64),headers={cookie:'ln_root='+signed+'; ln_csrf='+token,'x-csrf-token':token,'content-type':'application/json'};
 try{let r=await fetch(url,{redirect:'manual'});assert.equal(r.status,302);r=await fetch(url,{headers});assert.equal(r.status,200);assert((await r.text()).includes('reading-data'));r=await fetch(url,{method:'POST',headers,body:JSON.stringify({state:engine.initial(),action:'check',question:'q1',answer:'a'})});assert.equal(r.status,200);assert((await r.json()).state.items.q1.completed);r=await fetch(url,{method:'POST',headers:{cookie:headers.cookie,'content-type':'application/json'},body:'{}'});assert.equal(r.status,403);r=await fetch(url.replace('/1/','/2/'),{headers});assert.equal(r.status,404);}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));Object.assign(db,old);if(secret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=secret;}
});

test('translation HTTP route requires authentication, CSRF, limits and valid text',async()=>{
 const express=require('express'),cookies=require('cookie-parser'),db=require('../lib/db'),dict=require('../lib/dictionary-client');
 const old={column:db.hasColumn,translate:dict.translate,allowed:dict.allowed};db.hasColumn=()=>true;let allowed=true,calls=0;
 dict.allowed=()=>allowed;dict.translate=async text=>{calls++;return {source:text,translation:'English sentence.'};};
 const app=express();app.use(express.json(),cookies());const router=express.Router();require('../routes/reading').register(router,{requireStudent:(req,res,next)=>{if(!req.get('x-test-user'))return res.sendStatus(401);req.student={id:7};next();},fullStudent:async()=>({}),shell:()=>({}),view:()=>{}});app.use('/portal',router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url='http://127.0.0.1:'+server.address().port+'/portal/dictionary/translate';
 const headers={'Content-Type':'application/json','x-test-user':'7',cookie:'ln_csrf='+'a'.repeat(64),'x-csrf-token':'a'.repeat(64)};
 try{
  for(const [h,text,status] of [[{},'Hallo.',401],[{'x-test-user':'7'},'Hallo.',403],[headers,'',400],[headers,'a'.repeat(2001),400],[headers,'Hallo.',200]]){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify({text})});assert.equal(r.status,status);}
  allowed=false;assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({text:'Hallo.'})})).status,429);assert.equal(calls,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.hasColumn=old.column;dict.translate=old.translate;dict.allowed=old.allowed;}
});
