'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const db=require('../lib/db'),store=require('../lib/vocabulary-catalogue-store'),file=require('../lib/vocabulary-catalogue-file'),client=require('../lib/vocabulary-client'),tools=require('../lib/vocabulary-catalogue-bundle'),seed=file.bundle(),fixture=require('./fixtures/local-vocabulary-db.cjs').create();let original;
before(async()=>{original={query:db.query,queryOne:db.queryOne,transaction:db.transaction,isEnabled:db.isEnabled};Object.assign(db,{query:fixture.query,queryOne:fixture.queryOne,transaction:fixture.transaction,isEnabled:()=>true});await store.activate(seed);});after(()=>{Object.assign(db,original);fixture.close();});
test('complete lexical copy contains the original 12,252 stable IDs and 2,612 reviewed learning entries',()=>{assert.equal(seed.entries.length,12252);assert.equal(seed.entries.filter(e=>e.learningEnabled).length,2612);assert.equal(new Set(seed.entries.map(e=>e.id)).size,12252);assert(seed.metadata.pendingNewEntries.some(e=>e.word==='Sie'));assert(!seed.entries.some(e=>e.headword==='Sie'));});
const sets={G19:['dürfen','können','mögen','möchten','müssen','sollen','wollen'],G10:['bis','durch','für','gegen','ohne','um','entlang'],G11:['aus','ab','außer','bei','mit','nach','seit','von','zu','gegenüber'],G12:['an','auf','hinter','in','neben','über','unter','vor','zwischen']};
for(const [grammar,expected]of Object.entries(sets))test('database and bundled '+grammar+' completeness agree',async()=>{for(const provider of [store,file]){const found=await provider.list({grammar,limit:100});assert.equal(found.total,expected.length);assert.deepEqual(new Set(found.results.map(e=>e.headword)),new Set(expected));}});
test('local SQL filters intersect level, theme, grammar, type and principal-part search',async()=>{assert.deepEqual((await store.list({level:'A1',theme:'T03',grammar:'G19',type:'W02',q:'kann'})).results.map(e=>e.headword),['können']);assert.equal((await store.list({grammar:'G19',type:'W01',q:'kann'})).total,0);assert.equal((await store.list({theme:'T50',grammar:'G19'})).total,0);assert((await store.list({q:'möchtest',grammar:'G19'})).results.some(e=>e.headword==='möchten'));assert((await store.list({q:'keinem',type:'W08'})).results.some(e=>e.headword==='kein'));});
test('literal wildcard search and pagination behave identically in file and database',async()=>{for(const f of [{q:'%'},{q:'_'},{q:'KÖNNEN',grammar:'G19'},{q:'ko\u0308nnen',grammar:'G19'},{level:'A2',page:2,limit:7},{grammar:'G19',page:2,limit:2}]){const actual=await store.list(f),expected=await file.list(f);assert.deepEqual(actual,expected);}});
test('all canonical facets count actual local rows and respect the remaining filters',async()=>{const actual=await store.facets({grammar:'G19',type:'W02'}),expected=await file.facets({grammar:'G19',type:'W02'});assert.deepEqual(actual,expected);assert.equal(actual.grammar.G19,7);assert.equal(actual.types.W02,7);assert.equal(actual.types.W01,0);assert.equal(Object.keys(actual.themes).length,50);assert.equal(Object.keys(actual.grammar).length,38);assert.equal(Object.keys(actual.types).length,12);});
test('every Theme, Grammar and Word Type filter executes against the Website catalogue',async()=>{const c=require('../lib/vocabulary-contract').catalogue;for(const [group,key]of [['themes','theme'],['grammar','grammar'],['types','type']])for(const code of Object.keys(c[group])){const actual=await store.list({[key]:code,limit:1}),expected=await file.list({[key]:code,limit:1});assert.equal(actual.total,expected.total);assert.deepEqual(actual.results,expected.results);}});
test('runtime reads and progress validation work with all upstream networking disabled',async()=>{const old=global.fetch;global.fetch=async()=>{throw Error('Dictionary offline');};try{assert.equal((await client.list({grammar:'G19'})).total,7);assert.equal((await client.get('vocabulary:41')).headword,'mögen');assert.equal((await client.facets({grammar:'G12'})).grammar.G12,9);}finally{global.fetch=old;}});
test('publication and repeated import leave existing student progress and unique relations unchanged',async()=>{const progress=fixture.sql.prepare('SELECT * FROM student_vocabulary_progress').all(),before=fixture.sql.prepare('SELECT COUNT(*) AS n FROM vocabulary_catalogue_types').get().n;assert.equal((await store.activate(seed)).status,'already_active');assert.deepEqual(fixture.sql.prepare('SELECT * FROM student_vocabulary_progress').all(),progress);assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM vocabulary_catalogue_types').get().n,before);assert(!fixture.calls.some(c=>/^(UPDATE|DELETE|INSERT).*student_vocabulary/.test(c.sql)));});
test('invalid checksums, IDs, classifications and duplicate entries reject before database writes',async()=>{for(const mutate of [b=>{b.revision='0'.repeat(64);},b=>{b.entries[0].id='bad';},b=>{b.entries[0].grammarIds=['G99'];},b=>{b.entries.push(b.entries[0]);}]){const copy=structuredClone(seed);mutate(copy);const count=fixture.calls.length;await assert.rejects(store.activate(copy));assert.equal(fixture.calls.length,count);}});
test('a failed staged publication rolls back and keeps the last working catalogue',async()=>{const next=tools.create(seed.entries,{...seed.metadata,sourceHash:'a'.repeat(64)}),progress=fixture.sql.prepare('SELECT * FROM student_vocabulary_progress').all();fixture.fail('INSERT INTO vocabulary_catalogue_entries');try{await assert.rejects(store.activate(next),/Injected/);}finally{fixture.fail(null);}assert.equal((await store.status()).revision,seed.revision);assert.equal((await store.list({grammar:'G19'})).total,7);assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM vocabulary_catalogue_revisions').get().n,1);assert.deepEqual(fixture.sql.prepare('SELECT * FROM student_vocabulary_progress').all(),progress);});
test('stale synchronization and source deletions cannot overwrite the active catalogue',async()=>{await assert.rejects(store.activate(seed,{expectedRevision:'a'.repeat(64)}),/changed during/);const removed=seed.entries.slice(1),next=tools.create(removed,{...seed.metadata,sourceHash:'b'.repeat(64),sourceEntryCount:removed.length});await assert.rejects(store.activate(next),/removed existing/);assert.equal((await store.status()).revision,seed.revision);});
test('initial import never replaces an already active approved version',async()=>{const next=tools.create(seed.entries,{...seed.metadata,sourceHash:'c'.repeat(64)});assert.equal((await store.activate(next,{onlyIfEmpty:true})).status,'already_initialized');assert.equal((await store.status()).revision,seed.revision);});
test('an absent local schema uses real bundled data; transport failures are reported',async()=>{const old=db.queryOne;db.queryOne=async()=>{throw Object.assign(Error("Table 'website.vocabulary_catalogue_state' doesn't exist"),{code:'ER_NO_SUCH_TABLE'});};try{assert.equal((await client.list({grammar:'G19'})).total,7);}finally{db.queryOne=old;}db.queryOne=async()=>{throw Object.assign(Error('database offline'),{code:'ECONNREFUSED'});};try{await assert.rejects(client.list({grammar:'G19'}),/offline/);}finally{db.queryOne=old;}});
test('source synchronization failure keeps the published catalogue and progress',async()=>{const upstream=require('../lib/vocabulary-upstream'),old=upstream.exportSnapshot;upstream.exportSnapshot=async()=>{throw Error('source offline');};try{await assert.rejects(require('../lib/vocabulary-catalogue-sync').synchronize(seed.revision),/source offline/);assert.equal((await store.status()).revision,seed.revision);assert.equal(fixture.sql.prepare('SELECT mastery FROM student_vocabulary_progress').get().mastery,60);}finally{upstream.exportSnapshot=old;}});
test('snapshot completeness rejects truncated exports and forms assigned to another ID',()=>{const snapshot=require('../lib/vocabulary-snapshot'),manifest={kind:'manifest',vocabularyCount:1,nounCount:0,verbCount:0,adjectiveCount:0};assert.throws(()=>snapshot.snapshot([manifest]),/Incomplete/);const e={kind:'entry',id:1,word_de:'Wort',word_en:'word',pos:'noun',noun_forms:[{id:1,vocab_id:2}],verb_forms:[],adjective_forms:[],mappings:[]};assert.throws(()=>snapshot.snapshot([{...manifest,nounCount:1},e]),/different/);assert.throws(()=>snapshot.csv('snapshot_row\n"unfinished'),/Truncated/);});
test('catalogue schema and imports stay explicit, outside automatic startup migrations',()=>{const schema=fs.readFileSync(path.resolve(__dirname,'../MySQL/local_vocabulary_catalogue.sql'),'utf8');assert(!/UPDATE students|DELETE FROM|DROP TABLE/.test(schema));assert(!require('../lib/migrate').files().some(f=>String(f.name||f).includes('local_vocabulary_catalogue')));assert(!/vocabulary-catalogue-(?:store|sync)[^\n]*\.(?:bootstrap|initialize|activate)\s*\(/.test(fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8')));});

test('article and pronoun coverage retains reviewed senses and reports formal Sie as pending',async()=>{
 for(const provider of [store,file]){
  const articles=(await provider.list({type:'W08',limit:100})).results;
  assert.deepEqual(new Set(articles.map(e=>e.headword)),new Set(['der','die','das','ein','eine','kein']));
  const pronouns=(await provider.list({type:'W07',limit:100})).results;
  for(const word of ['ich','du','er','sie','es','wir','ihr'])assert(pronouns.some(e=>e.headword===word));
  const sie=pronouns.find(e=>e.headword==='sie');assert.equal(sie.meanings.length,2);
  assert(sie.meanings.some(m=>m.text==='she'));assert(sie.meanings.some(m=>m.text==='they'));
  assert(!pronouns.some(e=>e.headword==='Sie'));assert(seed.metadata.pendingNewEntries.some(e=>e.word==='Sie'));
 }
});
test('real local vocabulary supports progress, quiz and writing with Dictionary networking disabled',async()=>{
 const learning=require('../lib/vocabulary-learning'),practice=require('../lib/vocabulary-practice');
 const old={query:db.query,queryOne:db.queryOne,transaction:db.transaction,hasColumn:db.hasColumn,fetch:global.fetch};
 const progress=new Map(),sessions=new Map();
 db.hasColumn=()=>false;global.fetch=async()=>{throw Error('Dictionary offline');};
 db.query=async(q,p=[])=>{
  if(q.includes('vocabulary_catalogue_'))return old.query(q,p);
  if(q.startsWith('INSERT INTO student_vocabulary_progress')){const k=p[0]+':'+p[1];if(!progress.has(k))progress.set(k,{student_id:p[0],dictionary_entry_id:p[1],mastery:0,correct_count:0,incorrect_count:0});}
  else if(q.startsWith('UPDATE student_vocabulary_progress')){const row=progress.get(p.at(-2)+':'+p.at(-1)),fields=q.match(/SET (.+) WHERE/)[1].split(',').map(k=>k.trim().split(' ')[0]);fields.forEach((key,i)=>row[key]=p[i]);}
  else if(q.startsWith('INSERT INTO student_vocabulary_quiz_sessions'))sessions.set(p[0],{student_id:p[1],state_json:p[2]});
  else if(q.startsWith('UPDATE student_vocabulary_quiz_sessions'))sessions.get(p[2]).state_json=p[0];
  else if(!q.startsWith('DELETE FROM student_vocabulary_quiz_sessions'))throw Error('Unexpected progress SQL: '+q);
  return [];
 };
 db.queryOne=async(q,p=[])=>q.includes('vocabulary_catalogue_')?old.queryOne(q,p):q.includes('student_vocabulary_quiz_sessions')?(sessions.get(p[1])?.student_id===p[0]?sessions.get(p[1]):null):progress.get(p[0]+':'+p[1]);
 db.transaction=async fn=>fn({query:db.query,queryOne:db.queryOne});
 try{
  const p=await learning.update(7,'vocabulary:41','known');assert.equal(p.mastery,20);assert.equal(p.correct_count,1);
  const entries=(await client.list({grammar:'G19',limit:100})).results;
  const quiz=await practice.create(7,entries,'quiz'),state=JSON.parse(sessions.get(quiz.sessionId).state_json);
  const graded=await practice.answer(7,quiz.sessionId,quiz.question.id,state.questions[0].correctOption);
  assert.equal(graded.correct,true);assert.equal(graded.score,1);assert.equal(graded.question.index,2);
  const modal=entries.find(e=>e.headword==='können'),writing=await practice.create(7,[modal],'writing');
  assert.equal((await practice.answer(7,writing.sessionId,writing.question.id,'können')).correct,true);
  assert.equal(progress.get('7:'+modal.id).correct_count,1);
 }finally{Object.assign(db,{query:old.query,queryOne:old.queryOne,transaction:old.transaction,hasColumn:old.hasColumn});global.fetch=old.fetch;}
});

test('a validated update publishes atomically while retaining old versions and all student IDs',async()=>{
 const progress=fixture.sql.prepare('SELECT * FROM student_vocabulary_progress').all();
 const entries=structuredClone(seed.entries);entries.find(e=>e.id==='vocabulary:41').usageNote+=' Synchronization fixture.';
 const next=tools.create(entries,{...seed.metadata,sourceHash:'d'.repeat(64)});
 assert.equal((await store.activate(next,{expectedRevision:seed.revision})).status,'activated');
 assert.equal((await store.status()).revision,next.revision);
 assert.equal((await store.list({grammar:'G19'})).total,7);
 assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM vocabulary_catalogue_revisions').get().n,2);
 assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM vocabulary_catalogue_entries WHERE revision=?').get(seed.revision).n,12252);
 assert.deepEqual(fixture.sql.prepare('SELECT * FROM student_vocabulary_progress').all(),progress);
 assert.equal((await store.activate(next,{expectedRevision:next.revision})).status,'already_active');
});
