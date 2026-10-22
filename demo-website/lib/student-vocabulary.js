"use strict";
const db=require('./db');
const learning=require('./vocabulary-learning');
async function list(studentId) {return db.query('SELECT v.id, v.dictionary_key, v.headword, v.meaning, v.target_language, v.source_selection, v.source_context, v.source_exercise_id, v.created_at, e.title AS lesson_title, e.level AS cefr_level FROM student_vocabulary v LEFT JOIN exercises e ON e.id = v.source_exercise_id WHERE v.student_id = ? ORDER BY v.created_at DESC, v.id DESC LIMIT 500',[studentId]);}
async function save(studentId,entry,source) {
  const persist=async conn=>{
  await conn.query(`INSERT INTO student_vocabulary (student_id,dictionary_key,headword,meaning,target_language,source_exercise_id,source_selection,source_context)
    VALUES (?,?,?,?, 'en',?,?,?) ON DUPLICATE KEY UPDATE dictionary_key = VALUES(dictionary_key)`,
  [studentId,entry.id,(entry.displayHeadword||entry.headword).slice(0,250),(entry.meanings?.[0]?.text||'').slice(0,500),source.exerciseId,source.selection.slice(0,250),(source.context||'').slice(0,1000)]);
  if(learning.ready())await learning.saved(studentId,entry.id,true,source.module||'reading',conn);
  };
  if(learning.ready())await db.transaction(persist);else await persist(db);
}
async function remove(studentId,id){
  if(!learning.ready())return db.query('DELETE FROM student_vocabulary WHERE id = ? AND student_id = ?',[Number(id),studentId]);
  return db.transaction(async conn=>{const row=await conn.queryOne('SELECT dictionary_key FROM student_vocabulary WHERE id = ? AND student_id = ? FOR UPDATE',[Number(id),studentId]);if(row)await learning.saved(studentId,row.dictionary_key,false,'reading',conn);return conn.query('DELETE FROM student_vocabulary WHERE id = ? AND student_id = ?',[Number(id),studentId]);});
}
async function unsave(studentId,id){return db.transaction(async conn=>{await learning.saved(studentId,id,false,'vocabulary',conn);await conn.query('DELETE FROM student_vocabulary WHERE student_id = ? AND dictionary_key = ?',[studentId,id]);});}
module.exports={list,save,remove,unsave};
