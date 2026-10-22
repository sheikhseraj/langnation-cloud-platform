"use strict";
const db=require('./db');
const engine=require('./homework-engine');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
async function ensureAttempt(ex,studentId) {
  if(!db.hasColumn('exercise_attempts.learning_state'))throw Error('Homework progress needs migration 36.');
  return db.transaction(async tx=>{
    // Serialize first visits across tabs without replacing or regrading a historical attempt.
    await tx.queryOne('SELECT id FROM exercises WHERE id = ? FOR UPDATE',[ex.id]);
    const latest=await tx.queryOne('SELECT id, attempt, finished_at, learning_state FROM exercise_attempts WHERE exercise_id = ? AND student_id = ? ORDER BY attempt DESC LIMIT 1 FOR UPDATE',[ex.id,studentId]);
    if(latest?.learning_state)return latest;
    const answered=latest ? await tx.queryOne('SELECT COUNT(*) AS n FROM exercise_answers WHERE attempt_id = ?',[latest.id]) : null;
    const initial=JSON.stringify(engine.initial()),total=engine.questions(ex.learning).length;
    if(latest && !latest.finished_at && !Number(answered?.n)) {
      await tx.query('UPDATE exercise_attempts SET learning_state = ?, out_of = ? WHERE id = ?',[initial,total,latest.id]);
      return latest;
    }
    const number=Number(latest?.attempt||0)+1;
    const result=await tx.query('INSERT INTO exercise_attempts (exercise_id, student_id, attempt, out_of, started_at, learning_state) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?)',[ex.id,studentId,number,total,initial]);
    return {id:result.insertId,attempt:number};
  });
}
async function read(attemptId,studentId,exerciseId) {
  if(!db.hasColumn('exercise_attempts.learning_state'))throw Error('Homework progress needs migration 36.');
  const row=await db.queryOne('SELECT learning_state FROM exercise_attempts WHERE id = ? AND student_id = ? AND exercise_id = ?', [attemptId,studentId,exerciseId]);
  if(!row)throw Error('Attempt unavailable');
  return parse(row.learning_state)||engine.initial();
}
async function update(ex,studentId,command) {
  if(!db.hasColumn('exercise_attempts.learning_state'))throw Error('Homework progress needs migration 36.');
  if(JSON.stringify(command.answers??command.answer??null).length>20000) return {error:'Answer too long',code:400};
  return db.transaction(async tx=>{
    const row=await tx.queryOne('SELECT learning_state FROM exercise_attempts WHERE id = ? AND student_id = ? AND exercise_id = ? FOR UPDATE',[Number(command.attempt),studentId,ex.id]);
    if(!row)return {error:'Attempt unavailable',code:404};
    if(!row.learning_state)return {error:'Bitte lade die Seite neu, um die Lernaufgaben zu starten.',code:409};
    const previous=parse(row.learning_state)||engine.initial();
    if(command.revision!==previous.revision)return {error:'Der Fortschritt wurde in einem anderen Fenster geändert. Bitte lade die Seite neu.',code:409};
    let state;
    try {state=engine.transition(ex.learning,previous,command);}catch(e){return {error:e.message,code:400};}
    const counts=engine.tally(ex.learning,state);
    await tx.query('UPDATE exercise_attempts SET learning_state = ?, score = ?, out_of = ?, finished_at = IF(? = ?, COALESCE(finished_at, UTC_TIMESTAMP()), NULL) WHERE id = ?',
      [JSON.stringify(state),counts.green+counts.yellow,counts.total,counts.requiredCompleted??counts.completed,counts.requiredTotal??counts.total,Number(command.attempt)]);
    return {state,chapter:engine.publicChapter(ex.learning,state),counts};
  });
}
async function results(exerciseId,chapter) {
  const rows=await db.query(`SELECT a.student_id, a.learning_state, a.finished_at, s.name, s.student_ref
    FROM exercise_attempts a JOIN students s ON s.id = a.student_id
    WHERE a.exercise_id = ? AND a.learning_state IS NOT NULL AND s.deleted_at IS NULL
    ORDER BY a.attempt`,[Number(exerciseId)]);
  const first=new Map(),latest=new Map();
  for(const row of rows){const value={...row,state:parse(row.learning_state)};if(!first.has(row.student_id))first.set(row.student_id,value);latest.set(row.student_id,value);}
  if(chapter.module==='reading') {
    const ex=await db.queryOne('SELECT intake_id, unlock_emails FROM exercises WHERE id = ?',[Number(exerciseId)]);
    const exercises=require('./exercises');
    const roster=ex?.unlock_emails?await exercises.unlockedFor(exerciseId):await exercises.audienceFor(ex?.intake_id?'batch':'all',ex?.intake_id);
    for(const person of roster){const id=Number(person.id||person.student_id);if(id&&!latest.has(id))latest.set(id,{student_id:id,name:person.name,student_ref:person.student_ref,state:engine.initial(),finished_at:null});}
  }
  return {
    questions:engine.questions(chapter).map((q,index)=>{
      const items=[...first.values()].map(row=>row.state.analytics?.[q.id]||row.state.items[q.id]).filter(i=>i?.firstTryCorrect!==null&&i?.firstTryCorrect!==undefined);
      const got=items.filter(i=>i.firstTryCorrect).length,wrong=new Map();
      for(const i of items.filter(i=>!i.firstTryCorrect)){const given=typeof i.firstAnswer==='string'?i.firstAnswer:JSON.stringify(i.firstAnswer);if(given)wrong.set(given,(wrong.get(given)||0)+1);}
      const answer=engine.solution(q);
      return {id:q.id,seq:index+1,kind:q.type,prompt:q.prompt,got,missed:items.length-got,seen:items.length,
        answer:typeof answer==='string'?answer:JSON.stringify(answer),rate:items.length?Math.round(got/items.length*100):null,
        wrong:[...wrong].map(([given,n])=>({given,n})).sort((a,b)=>b.n-a.n).slice(0,3)};
    }),
    students:[...latest.values()].map(row=>{const counts=engine.tally(chapter,row.state);return {id:row.student_id,name:row.name,ref:row.student_ref,tries:chapter.module==='reading'?(counts.done?1:0):(counts.completed?1:0),best:counts.green+counts.yellow,outOf:counts.total,lastAt:row.finished_at,completed:counts.requiredCompleted??counts.completed,total:counts.requiredTotal??counts.total,status:counts.done?'Completed':(first.has(row.student_id)||Object.keys(row.state.items).length)?'In progress':'Not started'};})
  };
}
module.exports={ensureAttempt,read,update,results};
