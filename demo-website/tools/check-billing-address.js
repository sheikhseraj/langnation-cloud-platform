'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),db=require('../lib/db'),address=require('../lib/billing-address'),billing=require('../lib/billing');
test('billing recipient validates required company details and complete address bounds',()=>{
 assert.deepEqual(address.validate({recipient:'company',company:' Example GmbH ',address:' Main Street 3\r\n10115 Berlin\r\nGermany '}),{recipient:'company',company:'Example GmbH',address:'Main Street 3\n10115 Berlin\nGermany'});
 for(const data of [{recipient:'company',address:'x'},{recipient:'student',address:''},{recipient:'other',address:'x'},{recipient:'student',address:'x'.repeat(401)},{recipient:'company',company:'x'.repeat(201),address:'x'},{recipient:'student',address:{street:'x'}}])assert.throws(()=>address.validate(data),address.AddressError);
 assert.equal(address.validate({recipient:'student',company:'ignored',address:'Full address'}).company,null);
});
test('personal address uses profile city and company mode uses an independent recipient',()=>{
 const who={name:'Student',address:'Street 1',city:'10115 Berlin',country:'Germany'};
 assert.deepEqual(address.recipient(who),{name:'Student',address:'Street 1\n10115 Berlin\nGermany'});
 assert.equal(address.address({country:'Germany'}),'');
 assert.deepEqual(address.recipient({...who,invoice_recipient:'company',invoice_company:'Employer',invoice_address:'Company street\nHamburg'}),{name:'Employer',address:'Company street\nHamburg'});
});
test('saving preferences writes only the authenticated student and never issued invoices',async()=>{
 const old={hasColumn:db.hasColumn,query:db.query};const writes=[];db.hasColumn=()=>true;db.query=async(q,p)=>{writes.push([q,p]);return {affectedRows:1};};
 try{await address.save(7,{recipient:'company',company:'Employer',address:'Street 1',student_id:8});assert.equal(writes.length,1);assert(writes[0][0].includes('UPDATE students'));assert(writes[0][0].includes('deleted_at IS NULL'));assert.deepEqual(writes[0][1],['Employer','Street 1',7]);assert(!writes.some(([q])=>q.includes('UPDATE invoices')));db.hasColumn=()=>false;await assert.rejects(address.save(7,{recipient:'student',address:'Street'}),address.AddressError);}finally{Object.assign(db,old);}
});
test('issuing a draft freezes the company recipient and leaves issued records locked',async()=>{
 const old={isEnabled:db.isEnabled,hasColumn:db.hasColumn,transaction:db.transaction};const writes=[];db.isEnabled=()=>true;db.hasColumn=key=>key.startsWith('students.');
 db.transaction=async fn=>fn({query:async(q,p)=>{writes.push([q,p]);return q.startsWith('SELECT id FROM invoices')?[{id:9}]:[];},queryOne:async q=>q.includes('FROM students')?{name:'Student',invoice_recipient:'company',invoice_company:'Employer GmbH',invoice_address:'Office 5\n10115 Berlin'}:{last_number:1}});
 try{await billing.issueForStudent(7,{issuedOn:'2026-10-08'});const update=writes.find(([q])=>q.includes('UPDATE invoices'));assert(update);assert(update[0].includes("status = 'draft'"));assert.equal(update[1][5],'Employer GmbH');assert.equal(update[1][6],'Office 5\n10115 Berlin');}finally{Object.assign(db,old);}
});
test('migration is additive, guarded and discovered by the automatic runner',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../MySQL/45_invoice_billing_address.sql'),'utf8');assert.equal(require('../lib/migrate').classify(sql),'schema');for(const col of ['invoice_recipient','invoice_company','invoice_address'])assert(sql.includes("COLUMN_NAME='"+col+"'"));assert(!/UPDATE\s+invoices|DROP\s+TABLE|DELETE\s+FROM/i.test(sql));
});
test('actual billing-address endpoint requires sign-in and CSRF and ignores forged owner IDs',async()=>{
 const express=require('express'),cookies=require('cookie-parser'),students=require('../lib/students'),portal=require('../lib/portal');const old={enabled:db.isEnabled,current:students.current,save:address.save};const writes=[];
 db.isEnabled=()=>true;students.current=async req=>req.get('x-qa-student')==='7'?{id:7,name:'QA'}:null;address.save=async(id,value)=>writes.push([id,value]);
 const app=express();app.use(express.urlencoded({extended:false}),cookies());app.use('/portal',require('../routes/student').build());const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url='http://127.0.0.1:'+server.address().port+'/portal/settings/billing-address',token='a'.repeat(64);
 try{assert.equal((await fetch(url,{method:'POST',redirect:'manual'})).status,302);assert.equal((await fetch(url,{method:'POST',headers:{'x-qa-student':'7'}})).status,403);const res=await fetch(url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded','x-qa-student':'7',cookie:'ln_csrf='+token},body:new URLSearchParams({_csrf:token,recipient:'company',company:'Employer',address:'Office',student_id:'8'})});assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/portal/settings?billing=saved#invoice-address');assert.equal(writes.length,1);assert.equal(writes[0][0],7);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.isEnabled=old.enabled;students.current=old.current;address.save=old.save;}
});

test('reading an issued invoice preserves its address and distinguishes unit price from line amount',async()=>{
 const old={isEnabled:db.isEnabled,hasColumn:db.hasColumn,queryOne:db.queryOne,query:db.query};db.hasColumn=()=>false;db.isEnabled=()=>true;db.queryOne=async()=>({id:1,student_id:7,billing_name:'Original recipient',billing_address:'Original address',status:'issued',total:'500.00',paid_amount:'0.00',due_on:'2026-10-20'});db.query=async q=>q.includes('FROM invoice_items')?[{description:'Two sessions',quantity:2,unit_price:'250.00',amount:'500.00'}]:[];
 try{const invoice=await billing.invoice(1);assert.equal(invoice.billing_address,'Original address');assert.equal(invoice.items[0].unitPriceCents,25000);assert.equal(invoice.items[0].amountCents,50000);}finally{Object.assign(db,old);}
});
