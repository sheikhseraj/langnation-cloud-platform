'use strict';
const {DatabaseSync}=require('node:sqlite');
function create(){const sql=new DatabaseSync(':memory:'),calls=[];sql.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE vocabulary_catalogue_revisions(revision TEXT PRIMARY KEY,source_hash TEXT,entry_count INTEGER,enabled_count INTEGER,metadata TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE vocabulary_catalogue_state(singleton INTEGER PRIMARY KEY,current_revision TEXT REFERENCES vocabulary_catalogue_revisions(revision));
 CREATE TABLE vocabulary_catalogue_entries(revision TEXT REFERENCES vocabulary_catalogue_revisions(revision),dictionary_entry_id TEXT,source_id INTEGER,primary_level TEXT,learning_enabled INTEGER,headword TEXT,lemma TEXT,search_text TEXT,payload TEXT,PRIMARY KEY(revision,dictionary_entry_id),UNIQUE(revision,source_id));
 CREATE TABLE vocabulary_catalogue_themes(revision TEXT,dictionary_entry_id TEXT,code TEXT,PRIMARY KEY(revision,dictionary_entry_id,code),FOREIGN KEY(revision,dictionary_entry_id) REFERENCES vocabulary_catalogue_entries(revision,dictionary_entry_id));
 CREATE TABLE vocabulary_catalogue_grammar(revision TEXT,dictionary_entry_id TEXT,code TEXT,PRIMARY KEY(revision,dictionary_entry_id,code),FOREIGN KEY(revision,dictionary_entry_id) REFERENCES vocabulary_catalogue_entries(revision,dictionary_entry_id));
 CREATE TABLE vocabulary_catalogue_types(revision TEXT,dictionary_entry_id TEXT,code TEXT,PRIMARY KEY(revision,dictionary_entry_id,code),FOREIGN KEY(revision,dictionary_entry_id) REFERENCES vocabulary_catalogue_entries(revision,dictionary_entry_id));
 CREATE INDEX test_catalogue_level ON vocabulary_catalogue_entries(revision,learning_enabled,primary_level,source_id);
 CREATE TABLE student_vocabulary_progress(student_id INTEGER,dictionary_entry_id TEXT,mastery INTEGER);
 INSERT INTO student_vocabulary_progress VALUES (7,'vocabulary:41',60);`);
let failOn=null;const query=async(q,p=[])=>{calls.push({sql:q,params:p});if(failOn&&q.includes(failOn))throw Error('Injected publication failure');const text=q.replace(/INSERT IGNORE INTO/g,'INSERT OR IGNORE INTO').replace(/ FOR UPDATE/g,''),stmt=sql.prepare(text);if(/^\s*SELECT/.test(text))return stmt.all(...p);stmt.run(...p);return [];};const queryOne=async(...args)=>(await query(...args))[0]||null;
return {sql,calls,query,queryOne,isEnabled:()=>true,transaction:async fn=>{sql.exec('BEGIN IMMEDIATE');try{const value=await fn({query,queryOne});sql.exec('COMMIT');return value;}catch(e){sql.exec('ROLLBACK');throw e;}},fail:part=>{failOn=part;},close:()=>sql.close()};}
module.exports={create};
