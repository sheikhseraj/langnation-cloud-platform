"use strict";
const db=require('./db'),dictionary=require('./vocabulary-client'),domain=require('./vocabulary-domain');
const baseColumns=['student_vocabulary_progress.dictionary_entry_id','student_vocabulary_settings.daily_target'];
const columns=[...baseColumns,'student_vocabulary_activity.event_key','student_vocabulary_quiz_sessions.state_json'];
function ready(){return baseColumns.every(c=>db.hasColumn(c));}
function dateSql(date){return date instanceof Date?date.toISOString().slice(0,19).replace('T',' '):date;}
async function ensure(studentId,id,source='vocabulary',conn=db){
 await conn.query(`INSERT INTO student_vocabulary_progress (student_id,dictionary_entry_id,source) VALUES (?,?,?) ON DUPLICATE KEY UPDATE dictionary_entry_id=VALUES(dictionary_entry_id)`,[studentId,id,source]);
}
async function saved(studentId,id,value,source='vocabulary',conn=db){await ensure(studentId,id,source,conn);await conn.query('UPDATE student_vocabulary_progress SET saved = ? WHERE student_id = ? AND dictionary_entry_id = ?',[Number(value),studentId,id]);}
async function update(studentId,id,action,options={}){
 const mode=options.mode||'flashcard';if(!['flashcard','quiz'].includes(mode)||(mode==='quiz'&&typeof options.correct!=='boolean')||(options.operationId&&!/^[a-f0-9-]{36}$/i.test(options.operationId))){const e=Error('Invalid activity');e.status=400;throw e;}
 if(!dictionary.canonical(id)){const e=new Error('Canonical Dictionary ID required');e.status=400;throw e;}
 // Validate the action before any write or network call.
 domain.transition({},action);
 const entry=options.entry||await dictionary.get(id);if(entry.id!==id){const e=Error('Dictionary ID mismatch');e.status=400;throw e;}if(!entry.learningEnabled){const e=new Error('Vocabulary is not enabled for learning');e.status=400;throw e;}
 const persist=async conn=>{await ensure(studentId,id,'vocabulary',conn);const current=await conn.queryOne('SELECT * FROM student_vocabulary_progress WHERE student_id = ? AND dictionary_entry_id = ? FOR UPDATE',[studentId,id]);const isNew=!current.first_seen_at;if(options.operationId&&require('./vocabulary-dashboard').activityReady()){const prior=await conn.queryOne('SELECT id,dictionary_entry_id,action,mode,is_new FROM student_vocabulary_activity WHERE student_id = ? AND event_key = ? FOR UPDATE',[studentId,options.operationId]);if(prior?.id){if(prior.dictionary_entry_id!==id||prior.action!==action||prior.mode!==mode){const e=Error('Activity key already used');e.status=409;throw e;}return {...current,activityWasNew:Number(prior.is_new)===1};}}const next=domain.transition(current,action);
 if(require('./vocabulary-dashboard').activityReady())await conn.query('INSERT INTO student_vocabulary_activity (student_id,dictionary_entry_id,event_key,action,mode,is_new,quiz_correct,created_at) VALUES (?,?,?,?,?,?,?,?)',[studentId,id,options.operationId||require('crypto').randomUUID(),action,mode,isNew?1:0,mode==='quiz'?Number(options.correct===true):null,dateSql(next.last_seen_at)]);
 const keys=Object.keys(next);await conn.query('UPDATE student_vocabulary_progress SET '+keys.map(k=>k+' = ?').join(',')+' WHERE student_id = ? AND dictionary_entry_id = ?',[...keys.map(k=>dateSql(next[k])),studentId,id]);return {...current,...next,activityWasNew:isNew};};return options.conn?persist(options.conn):db.transaction(persist);
}
async function collection(studentId,filters){const data=await dictionary.list(filters);if(!data.results.length)return data;const ids=data.results.map(e=>e.id);const rows=await db.query('SELECT * FROM student_vocabulary_progress WHERE student_id = ? AND dictionary_entry_id IN ('+ids.map(()=>'?').join(',')+')',[studentId,...ids]);const progress=new Map(rows.map(p=>[p.dictionary_entry_id,p]));return {...data,results:data.results.map(e=>({...e,progress:progress.get(e.id)||null,quizTypes:domain.quizTypes(e)}))};}
async function personal(studentId,kind,page=1){
 if(!['all','saved','difficult','due'].includes(kind)){const e=new Error('Invalid collection');e.status=400;throw e;}
 const predicate={all:'(saved = 1 OR first_seen_at IS NOT NULL)',saved:'saved = 1',difficult:'difficult = 1',due:'next_review_at <= UTC_TIMESTAMP()'}[kind];
 const rows=await db.query('SELECT * FROM student_vocabulary_progress WHERE student_id = ? AND '+predicate+' ORDER BY updated_at DESC LIMIT 20 OFFSET ?',[studentId,(page-1)*20]);
 const ids=rows.map(p=>p.dictionary_entry_id).filter(dictionary.canonical);const entries=ids.length?(await dictionary.list({ids:ids.join(','),limit:100})).results:[];const byId=new Map(entries.map(e=>[e.id,e]));const results=rows.filter(p=>byId.has(p.dictionary_entry_id)).map(progress=>({...byId.get(progress.dictionary_entry_id),progress,quizTypes:domain.quizTypes(byId.get(progress.dictionary_entry_id))}));return {results,page,limit:20,hasMore:rows.length===20};
}
async function daily(studentId,filters={}){
 const settings=await db.queryOne('SELECT daily_target FROM student_vocabulary_settings WHERE student_id = ?',[studentId]);const chosen=Number(settings?.daily_target),target=Number.isInteger(chosen)&&chosen>=1&&chosen<=100?chosen:10;
 // School day boundaries are computed in Europe/Berlin, including DST.
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const seen=await db.query('SELECT dictionary_entry_id,first_seen_at FROM student_vocabulary_progress WHERE student_id = ? AND first_seen_at IS NOT NULL',[studentId]);
 const introduced=seen.filter(p=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(typeof p.first_seen_at==='string'?p.first_seen_at.replace(' ','T')+'Z':p.first_seen_at))===day).length;
 const remaining=Math.max(0,target-introduced),seenIds=new Set(seen.map(p=>p.dictionary_entry_id));
 let reviews=await db.query('SELECT * FROM student_vocabulary_progress WHERE student_id = ? AND next_review_at <= UTC_TIMESTAMP() ORDER BY difficult DESC, mastery ASC, incorrect_count DESC, next_review_at ASC LIMIT 100',[studentId]);reviews.sort(domain.reviewPriority);
 const ids=reviews.map(p=>p.dictionary_entry_id).filter(dictionary.canonical);const entries=ids.length?(await dictionary.list({ids:ids.join(','),limit:100})).results:[];const byId=new Map(entries.map(e=>[e.id,e]));const due=reviews.filter(p=>byId.has(p.dictionary_entry_id)).slice(0,20).map(progress=>({...byId.get(progress.dictionary_entry_id),progress}));
 const newWords=[];let page=1,total=Infinity;
 while(newWords.length<remaining&&(page-1)*100<total){const data=await dictionary.list({...filters,page,limit:100});total=data.total;for(const e of data.results)if(!seenIds.has(e.id)&&newWords.length<remaining)newWords.push(e);page++;if(!data.results.length)break;}
 return {target,introduced,remaining,newWords,reviews:due};
}
module.exports={columns,ready,ensure,saved,update,collection,personal,daily};
