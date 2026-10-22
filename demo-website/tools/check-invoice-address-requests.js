'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const db=require('../lib/db'),address=require('../lib/billing-address'),requests=require('../lib/invoice-address-requests'),mail=require('../lib/invoice-address-mail'),billing=require('../lib/billing'),mailer=require('../lib/mailer'),sent=require('../lib/sent');
const {createStore}=require('./fixtures/invoice-address-store');
async function fixture(fn){const store=createStore(),restore=store.install(db);try{await fn(store.state,store);}finally{restore();}}
const body={recipient:'company',address_source:'saved',acknowledge:'yes'};
test('new invoices use account personal address by default and complete company address takes priority',()=>{
 const who={name:'Person',address:'Personal Street',city:'Berlin',country:'Germany'};
 assert.deepEqual(address.recipient(who),{name:'Person',address:'Personal Street\nBerlin\nGermany'});
 assert.deepEqual(address.recipient({...who,invoice_company:'Employer',invoice_company_address:'Office Street',invoice_recipient:'student'}),{name:'Employer',address:'Office Street'});
 assert.equal(address.recipient({...who,invoice_company:'Employer'}).name,'Person');
});
test('saving either address preserves the other and its name',()=>fixture(async s=>{
 await address.save(7,{recipient:'student',address:'New personal street'});assert.equal(s.student.invoice_company,'Example Employer GmbH');assert.match(s.student.invoice_company_address,/Company Street/);
 await address.save(7,{recipient:'company',company:'New employer',address:'New office street'});assert.equal(s.student.invoice_personal_address,'New personal street');assert.equal(s.student.invoice_company,'New employer');
}));
test('recorded invoice address stays fixed after settings changes and repeat downloads',()=>fixture(async s=>{
 const original=structuredClone(s.invoice),first=await billing.invoice(1,{studentId:7});assert.equal(first.billing_name,'Student Example');assert.equal(first.address_revision,1);
 await address.save(7,{recipient:'company',company:'Changed employer',address:'Changed office'});
 const second=await billing.invoice(1);assert.equal(second.billing_address,first.billing_address);assert.equal(second.billing_name,first.billing_name);assert.equal(s.versions.length,1);assert.deepEqual(s.invoice,original);
 assert.equal(await billing.invoice(1,{studentId:8}),null);
}));
test('a legacy address gap is captured once rather than changing on each download',()=>fixture(async s=>{
 s.invoice.billing_address=null;const first=await billing.invoice(1);assert.equal(first.billing_name,'Example Employer GmbH');assert.equal(first.address_revision,1);
 await address.save(7,{recipient:'company',company:'Another company',address:'Another office'});const second=await billing.invoice(1);assert.equal(second.billing_address,first.billing_address);assert.equal(s.invoice.billing_address,null);
}));
test('request records side-by-side immutable addresses, one queued branded confirmation, and no money changes',()=>fixture(async s=>{
 const original=structuredClone(s.invoice),r=await requests.submit(7,1,{...body,student_id:8});
 assert.equal(s.requests[0].current_name,'Student Example');assert.equal(s.requests[0].wanted_name,'Example Employer GmbH');assert.equal(s.requests[0].status,'pending');assert.equal(s.notifications.length,1);assert.deepEqual(s.invoice,original);
 const email=mail.message(s.notifications[0]);assert.match(email.html,/email-seal.png/);assert.match(email.subject,/LangNation/);assert.match(email.text,/Personal Street/);assert.match(email.text,/Company Street/);
 await assert.rejects(requests.submit(7,1,body),/already reviewing/);assert.equal(s.notifications.length,1);assert.equal(r.id,1);
}));
test('ownership, acknowledgement, missing details and unavailable invoice states are enforced',()=>fixture(async(s)=>{
 await assert.rejects(requests.submit(8,1,body));assert.equal(s.requests.length,0);
 await assert.rejects(requests.submit(7,1,{...body,acknowledge:undefined}),/Confirm/);
 await assert.rejects(requests.submit(7,1,{...body,address_source:'manual',company:'',address:'X'}));
 for(const status of ['draft','void']){s.invoice.status=status;await assert.rejects(requests.submit(7,1,body),/not available/);}s.invoice.status='paid';s.invoice.kind='storno';await assert.rejects(requests.submit(7,1,body),/not available/);
}));
test('identical address and unsolicited admin changes are refused',()=>fixture(async s=>{
 await assert.rejects(requests.submit(7,1,{...body,recipient:'student'}),/already the address/);
 await assert.rejects(requests.review(99,{decision:'approve',acknowledge:'yes',address_source:'requested'}),/does not exist/);assert.equal(s.versions.length,0);
}));
test('approval appends a replacement, preserves original, queues a second email and cannot run twice',()=>fixture(async s=>{
 const original=structuredClone(s.invoice),r=await requests.submit(7,1,body);
 const out=await requests.review(r.id,{decision:'approve',address_source:'requested',acknowledge:'yes'});
 assert.equal(out.revision,2);assert.equal(s.requests[0].status,'approved');assert.equal(s.versions.length,2);assert.equal(s.versions[0].billing_name,'Student Example');assert.deepEqual(s.invoice,original);
 const invoice=await billing.invoice(1);assert.equal(invoice.billing_name,'Example Employer GmbH');assert.equal(invoice.address_revision,2);assert.equal(invoice.totalCents,25000);assert.equal(invoice.owedCents,0);
 assert.deepEqual(s.notifications.map(n=>n.event),['requested','approved']);assert.match(mail.message(s.notifications[1]).text,/superseded/);
 await assert.rejects(requests.review(r.id,{decision:'approve',address_source:'requested',acknowledge:'yes'}),/already been reviewed/);assert.equal(s.versions.length,2);
}));
test('admin can select saved personal address or enter a correction only on a pending request',()=>fixture(async s=>{
 const r=await requests.submit(7,1,body);await requests.review(r.id,{decision:'approve',address_source:'manual',recipient:'company',company:'Corrected employer',address:'Corrected office\nBerlin',acknowledge:'yes'});
 const v=await billing.invoice(1);assert.equal(v.billing_name,'Corrected employer');assert.match(v.billing_address,/Corrected office/);assert.equal((await requests.get(r.id)).approved_name,'Corrected employer');
 const back=await requests.submit(7,1,{...body,recipient:'student'});await requests.review(back.id,{decision:'approve',address_source:'saved',recipient:'student',acknowledge:'yes'});assert.equal((await billing.invoice(1)).billing_name,'Student Example');assert.equal(s.versions.length,3);
}));
test('declining needs a reason, preserves invoice and notifies the student',()=>fixture(async s=>{
 const r=await requests.submit(7,1,body);await assert.rejects(requests.review(r.id,{decision:'reject'}),/reason/);
 await requests.review(r.id,{decision:'reject',note:'Please provide the correct company details.'});assert.equal(s.requests[0].status,'rejected');assert.equal(s.versions.length,1);assert.equal(s.notifications[1].event,'rejected');assert.match(mail.message(s.notifications[1]).text,/correct company details/);
}));
test('stale version cannot be approved and concurrent submissions create only one pending request',()=>fixture(async s=>{
 const result=await Promise.allSettled([requests.submit(7,1,body),requests.submit(7,1,body)]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(s.requests.length,1);
 s.versions.push({...s.versions[0],id:2,revision:2});await assert.rejects(requests.review(1,{decision:'approve',address_source:'requested',acknowledge:'yes'}),/version has changed/);assert.equal(s.requests[0].status,'pending');assert.equal(s.notifications.length,1);
}));
test('failed confirmation email stays queued and retries in LangNation format',()=>fixture(async s=>{
 await requests.submit(7,1,body);const old={send:mailer.send,isConfigured:mailer.isConfigured,record:sent.record};const emails=[];mailer.isConfigured=()=>true;mailer.send=async m=>{emails.push(m);return {sent:emails.length>1,reason:'Temporary SMTP failure'};};sent.record=async()=>({ok:true});
 try{assert.equal((await mail.flush()).failed,1);assert.equal(s.notifications[0].sent_at,null);assert.equal(s.notifications[0].attempts,1);s.notifications[0].next=0;assert.equal((await mail.flush()).sent,1);assert(s.notifications[0].sent_at);assert.match(emails[1].html,/email-seal.png/);assert.equal(s.notifications[0].attempts,2);}finally{mailer.send=old.send;mailer.isConfigured=old.isConfigured;sent.record=old.record;}
}));
test('email escapes user company text and includes both text and HTML alternatives',()=>{
 const m=mail.message({event:'requested',request_id:1,to_email:'x@example.invalid',to_name:'<script>',payload:{number:'2026-1',invoice_id:1,current_name:'Person',current_address:'Street',wanted_name:'<img src=x onerror=alert(1)>',wanted_address:'Office'}});
 assert(!m.html.includes('<img src=x'));assert.match(m.html,/&lt;img/);assert(m.text.includes('<img src=x'));assert.match(m.html,/langnation/i);
});
test('request migration is schema-only, guarded, indexed and keeps invoices and payments intact',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../MySQL/46_invoice_address_requests.sql'),'utf8');assert.equal(require('../lib/migrate').classify(sql),'schema');assert.match(sql,/UNIQUE KEY one_pending_request/);assert.match(sql,/UNIQUE KEY invoice_revision/);assert(!/UPDATE\s+invoices|DELETE\s+FROM|DROP\s+TABLE/i.test(sql));
});

test('empty legacy address can be corrected, with a stable blank original version',()=>fixture(async s=>{
 s.invoice.billing_address=null;s.student.address='';s.student.city='';s.student.invoice_company_address='';s.student.invoice_company='';
 const r=await requests.submit(7,1,{recipient:'company',address_source:'manual',company:'Manual employer',address:'Office street',acknowledge:'yes'});assert.equal(s.versions[0].billing_address,'');assert.equal(s.requests[0].base_revision,1);
 await requests.review(r.id,{decision:'approve',address_source:'requested',acknowledge:'yes'});assert.equal((await billing.invoice(1)).billing_address,'Office street');assert.equal(s.versions[0].billing_address,'');
}));
test('a saved-address change since the form was opened requires the user to review again',()=>fixture(async s=>{
 await assert.rejects(requests.submit(7,1,{...body,company:'Old company',address:'Old office'}),/saved address changed/);assert.equal(s.requests.length,0);
}));
test('request, version and notification writes roll back together on queue failure',()=>fixture(async(s,store)=>{
 const originalQuery=store.query;db.transaction=fn=>store.transaction(t=>fn({...t,query:(q,p)=>q.startsWith('INSERT INTO invoice_address_notifications')?Promise.reject(new Error('Queue insert failed')):t.query(q,p)}));
 await assert.rejects(requests.submit(7,1,body),/Queue insert failed/);assert.equal(s.requests.length,0);assert.equal(s.versions.length,0);assert.equal(s.audit.length,0);
}));
test('actual student and admin endpoints enforce auth, ownership and CSRF across the complete request flow',()=>fixture(async(s)=>{
 process.env.SESSION_SECRET='invoice-route-test-secret';
 const express=require('express'),cookies=require('cookie-parser'),crypto=require('node:crypto'),students=require('../lib/students'),portal=require('../lib/portal');
 const old={current:students.current,profile:portal.profile,forStudent:billing.forStudent,configured:mailer.isConfigured};students.current=async req=>req.get('x-qa-student')==='7'?{...s.student,status:'active'}:null;portal.profile=async()=>({...s.student,status:'active'});billing.forStudent=async()=>[];mailer.isConfigured=()=>false;
 const app=express();app.set('view engine','ejs');app.set('views',path.resolve(__dirname,'../views'));app.use(express.urlencoded({extended:false}),cookies());app.use((req,res,next)=>{res.locals.site=require('../lib/site');next();});app.use('/portal',require('../routes/student').build());app.use('/admin',require('../routes/admin').build());
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));}),base='http://127.0.0.1:'+server.address().port;
 const csrf='b'.repeat(64),expires=String(Date.now()+100000),admin=expires+'.'+crypto.createHmac('sha256',process.env.SESSION_SECRET).update(expires).digest('hex');
 const studentHeaders={'x-qa-student':'7','Content-Type':'application/x-www-form-urlencoded',cookie:'ln_csrf='+csrf},adminHeaders={'Content-Type':'application/x-www-form-urlencoded',cookie:'ln_admin='+admin+'; ln_csrf='+csrf};
 const post=(url,headers,data)=>fetch(base+url,{method:'POST',redirect:'manual',headers,body:new URLSearchParams(data)});
 try{
  assert.equal((await fetch(base+'/portal/payments/invoice/1',{redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/portal/payments/invoice/2',{headers:studentHeaders})).status,404);
  assert.equal((await fetch(base+'/admin/payments/address-requests',{redirect:'manual'})).status,302);
  assert.equal((await post('/portal/payments/invoice/1/address-request',studentHeaders,body)).status,403);
  const request=await post('/portal/payments/invoice/1/address-request',studentHeaders,{...body,_csrf:csrf});assert.equal(request.status,303);assert.equal(s.requests.length,1);
  const pendingHtml=await (await fetch(base+'/admin/payments/address-requests/1',{headers:adminHeaders})).text();assert.match(pendingHtml,/Student wants/);assert.match(pendingHtml,/Example Employer GmbH/);
  const reviewBody={decision:'approve',address_source:'requested',acknowledge:'yes'};
  assert.equal((await post('/admin/payments/address-requests/1',adminHeaders,reviewBody)).status,403);
  assert.equal((await post('/admin/payments/address-requests/1',adminHeaders,{...reviewBody,_csrf:csrf})).status,303);
  const html=await (await fetch(base+'/portal/payments/invoice/1',{headers:studentHeaders})).text();assert.match(html,/Version 2/);assert.match(html,/supersedes all previous copies/);assert.match(html,/Example Employer GmbH/);
  assert.equal((await post('/admin/payments/address-requests/1',adminHeaders,{...reviewBody,_csrf:csrf})).status,400);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));students.current=old.current;portal.profile=old.profile;billing.forStudent=old.forStudent;mailer.isConfigured=old.configured;}
}));
