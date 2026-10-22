'use strict';
const {DatabaseSync}=require('node:sqlite');
function create(){
 const sql=new DatabaseSync(':memory:'),calls=[];
 sql.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE students(id INTEGER PRIMARY KEY,name TEXT,email TEXT,student_ref TEXT,status TEXT,address TEXT,country TEXT,city TEXT,deleted_at TEXT,invoice_recipient TEXT,invoice_company TEXT,invoice_address TEXT,invoice_personal_address TEXT,invoice_company_address TEXT);
 CREATE TABLE courses(id INTEGER PRIMARY KEY,lang TEXT,title TEXT,price_eur TEXT,discount_eur TEXT);
 CREATE TABLE intakes(id INTEGER PRIMARY KEY,course_id INTEGER REFERENCES courses(id),code TEXT,meeting_url TEXT,teacher_id INTEGER,starts_on TEXT);
 CREATE TABLE enrolments(id INTEGER PRIMARY KEY,student_id INTEGER REFERENCES students(id),intake_id INTEGER REFERENCES intakes(id),status TEXT,enrolled_on TEXT DEFAULT CURRENT_DATE,UNIQUE(student_id,intake_id));
 CREATE TABLE invoice_counters(series TEXT,year INTEGER,last_number INTEGER,PRIMARY KEY(series,year));
 CREATE TABLE invoices(id INTEGER PRIMARY KEY,student_id INTEGER REFERENCES students(id),enrolment_id INTEGER REFERENCES enrolments(id),number TEXT UNIQUE,currency TEXT,kind TEXT DEFAULT 'invoice',subtotal TEXT,total TEXT,paid_amount TEXT DEFAULT '0.00',status TEXT,issued_on TEXT,due_on TEXT,paid_on TEXT,locked_at TEXT,instalment_no INTEGER,instalment_of INTEGER,seller_name TEXT,seller_address TEXT,seller_tax_id TEXT,billing_name TEXT,billing_address TEXT,tax_note TEXT);
 CREATE TABLE invoice_items(id INTEGER PRIMARY KEY,invoice_id INTEGER REFERENCES invoices(id),description TEXT,quantity TEXT,unit_price TEXT,amount TEXT,sort_order INTEGER);
 CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_type TEXT,actor_id INTEGER,action TEXT,entity TEXT,entity_id INTEGER,detail TEXT,ip TEXT);
 CREATE TABLE lessons(id INTEGER PRIMARY KEY,intake_id INTEGER REFERENCES intakes(id),title TEXT,starts_at TEXT,started_at TEXT,meeting_url TEXT,status TEXT);
 CREATE TABLE attendance(lesson_id INTEGER REFERENCES lessons(id),student_id INTEGER REFERENCES students(id),status TEXT,source TEXT,minutes_late INTEGER,joined_at TEXT,PRIMARY KEY(lesson_id,student_id));
 INSERT INTO students(id,name,email,student_ref,status,address,country) VALUES(7,'Demo Student','demo@example.test','LNS0013','active','Teststrasse 1, 12345 Berlin','Germany');
 INSERT INTO courses VALUES(2,'en','German Regular A1','750.00','600.00');
 INSERT INTO intakes(id,course_id,code,meeting_url,teacher_id) VALUES(6,2,'LNRKB04','https://example.test/class',3);`);
 let failOn=null;
 async function query(q,p=[]){calls.push({sql:q,params:p});if(failOn&&q.includes(failOn))throw Error('Injected persistence failure');
  let text=q.replace(/ FOR UPDATE/g,'').replace(/NOW\(\)/g,'CURRENT_TIMESTAMP');
  text=text.replace(/ON DUPLICATE KEY UPDATE last_number\s*=\s*last_number\s*\+\s*1/,'ON CONFLICT(series,year) DO UPDATE SET last_number=last_number+1');
  if(text.includes('INSERT INTO attendance'))text=text.slice(0,text.indexOf('ON DUPLICATE KEY'))+`ON CONFLICT(lesson_id,student_id) DO UPDATE SET
   status=CASE WHEN source='self' THEN excluded.status ELSE status END,
   minutes_late=CASE WHEN source='self' THEN excluded.minutes_late ELSE minutes_late END,
   joined_at=COALESCE(joined_at,excluded.joined_at)`;
  const stmt=sql.prepare(text);
  if(/^\s*SELECT/.test(text))return stmt.all(...p);
  try{const r=stmt.run(...p);return {insertId:Number(r.lastInsertRowid),affectedRows:r.changes};}catch(e){if(e.errcode===2067)e.code='ER_DUP_ENTRY';throw e;}
 }
 async function queryOne(...a){return (await query(...a))[0]||null;}
 return {sql,calls,query,queryOne,isEnabled:()=>true,hasColumn:()=>false,transaction:async fn=>{sql.exec('BEGIN IMMEDIATE');try{const r=await fn({query,queryOne});sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}},fail:part=>failOn=part,close:()=>sql.close()};
}
module.exports={create};
