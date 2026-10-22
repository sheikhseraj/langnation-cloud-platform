'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const db=require('../lib/db'),enrolments=require('../lib/enrolments'),billing=require('../lib/billing'),attendance=require('../lib/attendance');
const fixture=require('./fixtures/portal-flows-db.cjs');
async function withDb(run){const f=fixture.create(),old={};for(const k of ['query','queryOne','transaction','isEnabled','hasColumn']){old[k]=db[k];db[k]=f[k];}try{return await run(f);}finally{Object.assign(db,old);f.close();}}
test('enrolling creates an issued unpaid invoice visible in student Payments, using the discounted fee',()=>withDb(async f=>{
 const out=await enrolments.add(6,'LNS0013');assert(out.ok);assert.equal(out.billing.status,'issued');assert.match(out.message,/Invoice/);
 const plans=await billing.forStudent(7);assert.equal(plans.length,1);assert.equal(plans[0].total,60000);assert.equal(plans[0].owed,60000);assert.equal(plans[0].paid,0);
 const bill=f.sql.prepare('SELECT * FROM invoices').get();assert.equal(bill.status,'issued');assert.equal(bill.billing_name,'Demo Student');assert.match(bill.billing_address,/Teststrasse/);assert.equal(bill.issued_on,bill.due_on);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM invoice_items').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,1);
}));
test('invoice failure rolls back membership, invoice number and every financial row',()=>withDb(async f=>{
 f.fail('INSERT INTO invoice_items');await assert.rejects(enrolments.add(6,'LNS0013'),/Injected/);
 for(const table of ['enrolments','invoices','invoice_items','invoice_counters','audit_log'])assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);
}));
test('duplicate enrolment cannot double bill or consume a second invoice number',()=>withDb(async f=>{
 assert((await enrolments.add(6,'LNS0013')).ok);assert.equal((await enrolments.add(6,'LNS0013')).ok,false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,1);assert.equal(f.sql.prepare('SELECT last_number FROM invoice_counters').get().last_number,1);
 const current=f.sql.prepare('SELECT id FROM enrolments').get();await f.transaction(async tx=>assert.equal((await billing.issueAtEnrolment(tx,current.id)).status,'already_billed'));
 assert.equal(f.sql.prepare('SELECT last_number FROM invoice_counters').get().last_number,1);
}));
test('invoice counter conflicts are reported as failures rather than duplicate enrolments',()=>withDb(async f=>{
 f.fail('INSERT INTO invoice_counters');await assert.rejects(enrolments.add(6,'LNS0013'),/Injected/);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM enrolments').get().n,0);
}));
test('new enrolment freezes company recipient when both addresses are available',()=>withDb(async f=>{
 db.hasColumn=()=>true;f.sql.exec("UPDATE students SET invoice_company='Example GmbH',invoice_company_address='Companystrasse 2, 12345 Berlin' WHERE id=7");
 await enrolments.add(6,'LNS0013');const bill=f.sql.prepare('SELECT billing_name,billing_address FROM invoices').get();assert.equal(bill.billing_name,'Example GmbH');assert.match(bill.billing_address,/Companystrasse/);
 f.sql.exec("UPDATE students SET invoice_company='Changed company' WHERE id=7");assert.equal(f.sql.prepare('SELECT billing_name FROM invoices').get().billing_name,'Example GmbH');
}));
test('free and unpriced courses enrol without inventing a payable amount',()=>withDb(async f=>{
 f.sql.exec("UPDATE courses SET price_eur='0.00',discount_eur=NULL");const free=await enrolments.add(6,'LNS0013');assert.equal(free.billing.status,'free');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,0);
 f.sql.exec('DELETE FROM enrolments;UPDATE courses SET price_eur=NULL');const missing=await enrolments.add(6,'LNS0013');assert.equal(missing.billing.status,'fee_unset');assert.match(missing.message,/Set the course fee/);
 assert.equal((await billing.pendingEnrolments(7))[0].fee,null);
}));
test('legacy unbilled enrolments are visible only to their owner, without creating invoices during reads',()=>withDb(async f=>{
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active','2026-10-14')");const pending=await billing.pendingEnrolments(7);assert.equal(pending.length,1);assert.equal(pending[0].fee,60000);assert.deepEqual(await billing.pendingEnrolments(99),[]);
 assert.deepEqual(await billing.pendingEnrolments(7,[{combined:true}]),[]);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM invoices').get().n,0);
 assert(!f.calls.some(c=>/^\s*(INSERT|UPDATE|DELETE)/.test(c.sql)));
}));
test('fee selection is exact and refuses invalid data',()=>{
 assert.equal(billing.enrolmentFee({price_eur:'0.07',discount_eur:null}),7);assert.equal(billing.enrolmentFee({price_eur:'750',discount_eur:'800'}),75000);assert.equal(billing.enrolmentFee({price_eur:null}),null);
 assert.throws(()=>billing.enrolmentFee({price_eur:'nonsense'}));assert.throws(()=>billing.enrolmentFee({price_eur:'-1'}));
});
test('student join records attendance and resolves the lesson-specific room',()=>withDb(async f=>{
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active',CURRENT_DATE);INSERT INTO lessons VALUES(20,6,'Lesson',CURRENT_TIMESTAMP,NULL,'https://example.test/lesson-room','scheduled')");
 const result=await attendance.recordJoin(7,6,attendance.normaliseDate(null));assert.equal(result.meetingUrl,'https://example.test/lesson-room');assert.equal(f.sql.prepare('SELECT source FROM attendance').get().source,'self');
 assert(f.calls.find(c=>c.sql.includes("e.status = 'active'")).sql.includes('e.student_id = ?'));
}));
test('unrelated students cannot write attendance or obtain the class room',()=>withDb(async f=>{
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active',CURRENT_DATE)");assert.equal(await attendance.recordJoin(99,6,attendance.normaliseDate(null)),null);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM lessons').get().n,0);
}));
test('teacher attendance marks survive a repeated student join',()=>withDb(async f=>{
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active',CURRENT_DATE);INSERT INTO lessons VALUES(20,6,'Lesson',CURRENT_TIMESTAMP,NULL,NULL,'scheduled');INSERT INTO attendance VALUES(20,7,'excused','teacher',NULL,NULL)");
 await attendance.recordJoin(7,6,attendance.normaliseDate(null));assert.equal(f.sql.prepare('SELECT status FROM attendance').get().status,'excused');
}));
test('unusable room links cannot create fake lessons or attendance',()=>withDb(async f=>{
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active',CURRENT_DATE);UPDATE intakes SET meeting_url='javascript:alert(1)'");assert.equal(await attendance.recordJoin(7,6,attendance.normaliseDate(null)),null);assert.equal(await attendance.startClass(3,6,attendance.normaliseDate(null)),null);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM lessons').get().n,0);
}));
test('teacher start resolves overrides and refuses another teacher',()=>withDb(async f=>{
 f.sql.exec("INSERT INTO lessons VALUES(20,6,'Lesson',CURRENT_TIMESTAMP,NULL,'https://example.test/override','scheduled')");assert.equal(await attendance.startClass(4,6,attendance.normaliseDate(null)),null);
 const result=await attendance.startClass(3,6,attendance.normaliseDate(null));assert.equal(result.meetingUrl,'https://example.test/override');assert(f.sql.prepare('SELECT started_at FROM lessons').get().started_at);
}));
test('private join/start HTTP routes require session and CSRF, then use a 303 GET redirect',()=>withDb(async f=>{
 const express=require('express'),cookies=require('cookie-parser'),students=require('../lib/students'),teachers=require('../lib/teachers'),old={student:students.current,teacher:teachers.current};
 students.current=async req=>req.get('x-test-student')==='yes'?{id:7,name:'Demo'}:null;teachers.current=async req=>req.get('x-test-teacher')==='yes'?{id:3,name:'Demo'}:null;
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active',CURRENT_DATE)");
 const app=express();app.use(express.urlencoded({extended:false}),cookies());app.use('/portal',require('../routes/student').build());app.use('/teach',require('../routes/teacher').build());
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port,token='a'.repeat(64);
 try {for(const [url,header]of [['/portal/join/6','x-test-student'],['/teach/batch/6/start','x-test-teacher']]){
  assert.match((await fetch(base+url,{method:'POST',redirect:'manual'})).headers.get('location'),/login/);
  assert.equal((await fetch(base+url,{method:'POST',headers:{[header]:'yes'},redirect:'manual'})).status,403);
  const headers={[header]:'yes','Content-Type':'application/x-www-form-urlencoded',cookie:'ln_csrf='+token};
  assert.equal((await fetch(base+url,{method:'POST',headers:{...headers,'sec-fetch-site':'cross-site'},body:'_csrf='+token,redirect:'manual'})).status,403);
  const response=await fetch(base+url,{method:'POST',headers,body:'_csrf='+token,redirect:'manual'});assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://example.test/class');
 }}finally{students.current=old.student;teachers.current=old.teacher;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}));

test('lesson room remains usable when the batch default is missing',()=>withDb(async f=>{
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active',CURRENT_DATE);UPDATE intakes SET meeting_url=NULL;INSERT INTO lessons VALUES(20,6,'Lesson',CURRENT_TIMESTAMP,NULL,'https://example.test/lesson-only','scheduled')");
 assert.equal((await attendance.recordJoin(7,6,attendance.normaliseDate(null))).meetingUrl,'https://example.test/lesson-only');
 assert.equal((await attendance.startClass(3,6,attendance.normaliseDate(null))).meetingUrl,'https://example.test/lesson-only');
}));
test('daily room query and rendered destination use the same uncancelled lesson override',()=>withDb(async f=>{
 const links=require('../lib/class-links');f.sql.function('UTC_DATE',()=>attendance.normaliseDate(null));
 f.sql.exec("INSERT INTO lessons VALUES(19,6,'Cancelled',CURRENT_TIMESTAMP,NULL,'https://example.test/cancelled','cancelled');INSERT INTO lessons VALUES(20,6,'Lesson',CURRENT_TIMESTAMP,NULL,'https://example.test/override','scheduled')");
 const row=f.sql.prepare('SELECT i.meeting_url,'+links.todayRoomSql()+' FROM intakes i WHERE i.id=6').get();
 assert.equal(links.room(row),'https://example.test/override');assert.equal(links.room({meeting_url:'https://example.test/default'}),'https://example.test/default');
 assert.equal(links.room({current_meeting_url:'javascript:bad',meeting_url:'https://example.test/default'}),null);
}));
test('class JSON tracking responds without redirecting to the external room',()=>withDb(async f=>{
 const express=require('express'),cookies=require('cookie-parser'),students=require('../lib/students'),teachers=require('../lib/teachers'),old={student:students.current,teacher:teachers.current};
 students.current=async()=>({id:7,name:'Demo'});teachers.current=async()=>({id:3,name:'Demo'});
 f.sql.exec("INSERT INTO enrolments VALUES(10,7,6,'active',CURRENT_DATE)");
 const app=express();app.use(express.urlencoded({extended:false}),cookies());app.use('/portal',require('../routes/student').build());app.use('/teach',require('../routes/teacher').build());
 const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));}),base='http://127.0.0.1:'+server.address().port,token='a'.repeat(64);
 try{for(const url of ['/portal/join/6','/teach/batch/6/start']){
  const result=await fetch(base+url,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',cookie:'ln_csrf='+token},body:'_csrf='+token,redirect:'manual'});
  assert.equal(result.status,200);assert.equal(result.headers.get('location'),null);assert.deepEqual(await result.json(),{ok:true});
  assert.equal((await fetch(base+url,{method:'POST',headers:{Accept:'application/json'},redirect:'manual'})).status,403);
 }}finally{students.current=old.student;teachers.current=old.teacher;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}));
function trackingFixture(response){
 const vm=require('node:vm'),fs=require('fs'),source=fs.readFileSync(require.resolve('../public/js/app.js'),'utf8');
 let handler,notice=null;const calls=[],parent={querySelector:()=>notice,appendChild:value=>notice=value};
 const link={dataset:{classAction:'/portal/join/6',classCsrf:'a'.repeat(64)},parentElement:parent,addEventListener:(type,fn)=>handler=fn};
 const context={URL,URLSearchParams,location:{origin:'https://school.example.test'},document:{querySelectorAll:()=>[link],createElement:()=>({dataset:{},setAttribute(){},remove(){notice=null;}})},fetch:async(...args)=>{calls.push(args);if(response instanceof Error)throw response;return response;}};
 vm.runInNewContext(source.slice(source.indexOf('/* CLASS-LINK-TRACKING:'),source.indexOf('/* END CLASS-LINK-TRACKING */')),context);
 return {click:handler,calls,notice:()=>notice};
}
test('opening a class does not prevent native new-tab navigation or depend on a redirect',async()=>{
 const ui=trackingFixture({ok:true,json:async()=>({ok:true})});let prevented=false;
 ui.click({button:0,defaultPrevented:false,preventDefault(){prevented=true;}});await new Promise(setImmediate);
 assert.equal(prevented,false);assert.equal(ui.calls.length,1);const [url,options]=ui.calls[0];assert.equal(url,'https://school.example.test/portal/join/6');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.keepalive,true);assert.equal(options.headers.Accept,'application/json');assert.match(options.body,/^_csrf=/);assert.equal(ui.notice(),null);
});
test('attendance failure leaves room navigation untouched and displays a useful notice',async()=>{
 const ui=trackingFixture(new Error('Database offline'));let prevented=false;
 ui.click({button:0,defaultPrevented:false,preventDefault(){prevented=true;}});await new Promise(setImmediate);
 assert.equal(prevented,false);assert.match(ui.notice().textContent,/could not be saved.*class link/);
});
