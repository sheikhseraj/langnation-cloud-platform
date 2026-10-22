'use strict';
const db=require('./db'),address=require('./billing-address');
class RequestError extends Error{constructor(message){super(message);this.name='RequestError';}}
const ready=()=>db.isEnabled()&&['invoice_address_versions.id','invoice_address_requests.id','invoice_address_notifications.id'].every(c=>db.hasColumn(c));
const idOf=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw new RequestError('That request or invoice does not exist.');return n;};
async function audit(t,invoiceId,action,detail,studentId=null){await t.query("INSERT INTO audit_log (actor_type,actor_id,action,entity,entity_id,detail) VALUES (?, ?, ?, 'invoice', ?, ?)",[studentId?'student':'staff',studentId,action,invoiceId,JSON.stringify(detail)]);}
async function version(t,bill,freezeEmpty=false){
 let v=await t.queryOne('SELECT * FROM invoice_address_versions WHERE invoice_id = ? ORDER BY revision DESC LIMIT 1',[bill.id]);
 if(v)return v;
 let name=String(bill.billing_name||bill.student_name||'').trim(),where=String(bill.billing_address||'').trim(),kind=name===bill.student_name?'student':'company',source='issued';
 if(!where){
  const who=await t.queryOne('SELECT id,name,address,country'+address.columns()+' FROM students WHERE id = ? AND deleted_at IS NULL',[bill.student_id]);
  if(who){const target=address.recipient(who);name=target.name||name;where=target.address||'';kind=name===who.name?'student':'company';source='settings';}
 }
 if(!where&&!freezeEmpty)return null;
 await t.query('INSERT INTO invoice_address_versions (invoice_id,revision,recipient,billing_name,billing_address,source) VALUES (?,1,?,?,?,?)',[bill.id,kind,name,where,source]);
 await audit(t,bill.id,'invoice.address.captured',{revision:1,source});
 return {revision:1,recipient:kind,billing_name:name,billing_address:where,source};
}
// Original invoice rows and every prior version are retained. Only the latest version is served.
async function effective(bill){
 if(!ready()||bill.status==='draft')return bill;
 return db.transaction(async t=>{
  const locked=await t.queryOne('SELECT id,student_id,status,billing_name,billing_address FROM invoices WHERE id = ? FOR UPDATE',[bill.id]);
  if(!locked)return bill;
  const v=await version(t,{...bill,...locked});
  return v?{...bill,billing_name:v.billing_name,billing_address:v.billing_address,billing_recipient:v.recipient,address_revision:Number(v.revision),address_corrected_at:v.revision>1?v.created_at:null}:bill;
 });
}
async function history(invoiceId,studentId){
 if(!ready())return [];
 return db.query('SELECT * FROM invoice_address_requests WHERE invoice_id = ? AND student_id = ? ORDER BY id DESC',[idOf(invoiceId),idOf(studentId)]);
}
function target(body,details){
 const kind=body.recipient;
 if(body.address_source==='saved'){
  const where=kind==='company'?details.companyAddress:details.personalAddress;
  const v=address.validate({recipient:kind,company:details.company,address:where});
  if((body.address!==undefined&&String(body.address).replace(/\r\n?/g,'\n').trim()!==v.address)||(kind==='company'&&body.company!==undefined&&String(body.company).trim()!==v.company))throw new RequestError('Your saved address changed. Reload and check it before submitting.');
  return {recipient:v.recipient,name:kind==='company'?v.company:details.name,address:v.address};
 }
 if(body.address_source!=='manual')throw new RequestError('Choose a saved address or enter a new address.');
 const v=address.validate(body);
 return {recipient:v.recipient,name:kind==='company'?v.company:details.name,address:v.address};
}
async function queue(t,request,who,event,extra={}){
 await t.query('INSERT INTO invoice_address_notifications (request_id,event,to_email,to_name,payload) VALUES (?,?,?,?,?)',[request.id,event,who.email,who.name,JSON.stringify({...request,...extra,event})]);
}
async function submit(studentId,invoiceId,body){
 if(!ready())throw new RequestError('Invoice address requests are temporarily unavailable. Please contact the office.');
 studentId=idOf(studentId);invoiceId=idOf(invoiceId);
 if(body.acknowledge!=='yes')throw new RequestError('Confirm that the replacement will supersede your previous invoice copy.');
 const details=await address.current(studentId),wanted=target(body,details);
 return db.transaction(async t=>{
  const bill=await t.queryOne('SELECT i.*,s.name AS student_name,s.email AS student_email FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.id = ? AND i.student_id = ? FOR UPDATE',[invoiceId,studentId]);
  if(!bill||bill.status==='draft'||bill.status==='void'||bill.kind==='storno')throw new RequestError('This invoice is not available for an address change.');
  const v=await version(t,bill,true);
  const current=v||{revision:0,recipient:bill.billing_name===bill.student_name?'student':'company',billing_name:bill.billing_name||bill.student_name,billing_address:bill.billing_address||''};
  if(current.billing_name===wanted.name&&current.billing_address===wanted.address)throw new RequestError('This is already the address on your invoice.');
  if(await t.queryOne("SELECT id FROM invoice_address_requests WHERE invoice_id = ? AND status = 'pending'",[invoiceId]))throw new RequestError('The office is already reviewing a request for this invoice.');
  const result=await t.query('INSERT INTO invoice_address_requests (invoice_id,student_id,base_revision,current_recipient,current_name,current_address,wanted_recipient,wanted_name,wanted_address) VALUES (?,?,?,?,?,?,?,?,?)',[invoiceId,studentId,current.revision,current.recipient,current.billing_name,current.billing_address,wanted.recipient,wanted.name,wanted.address]);
  const request={id:result.insertId,invoice_id:invoiceId,number:bill.number,current_name:current.billing_name,current_address:current.billing_address,wanted_name:wanted.name,wanted_address:wanted.address};
  await queue(t,request,{name:bill.student_name,email:bill.student_email},'requested');
  await audit(t,invoiceId,'invoice.address.requested',{requestId:request.id,baseRevision:current.revision},studentId);
  return request;
 });
}
async function list(status='pending'){
 if(!ready())return [];
 const filter=['pending','approved','rejected'].includes(status)?status:'pending';
 return db.query('SELECT r.*,s.name AS student_name,s.email AS student_email,s.student_ref,i.number FROM invoice_address_requests r JOIN students s ON s.id=r.student_id JOIN invoices i ON i.id=r.invoice_id WHERE r.status = ? ORDER BY r.created_at,r.id LIMIT 200',[filter]);
}
async function get(requestId){
 if(!ready())return null;
 return db.queryOne('SELECT r.*,s.name AS student_name,s.email AS student_email,s.student_ref,i.number,v.billing_name AS approved_name,v.billing_address AS approved_address,v.revision AS approved_revision FROM invoice_address_requests r JOIN students s ON s.id=r.student_id JOIN invoices i ON i.id=r.invoice_id LEFT JOIN invoice_address_versions v ON v.request_id=r.id WHERE r.id = ?',[idOf(requestId)]);
}
async function review(requestId,body){
 if(!ready())throw new RequestError('Invoice address requests are unavailable.');
 const record=await get(requestId);if(!record)throw new RequestError('That request does not exist.');
 const decision=body.decision;if(!['approve','reject'].includes(decision))throw new RequestError('Choose approve or reject.');
 const note=typeof body.note==='string'?body.note.trim():'';
 if(note.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note))throw new RequestError('Use a review note of 500 characters or fewer.');
 if(decision==='reject'&&note.length<3)throw new RequestError('Give the student a reason for declining the request.');
 if(decision==='approve'&&body.acknowledge!=='yes')throw new RequestError('Confirm that the new version supersedes the previous copy.');
 let wanted;
 if(decision==='approve'){
  const details=await address.current(record.student_id);
  wanted=body.address_source==='requested'?{recipient:record.wanted_recipient,name:record.wanted_name,address:record.wanted_address}:target(body,details);
 }
 return db.transaction(async t=>{
  // All writers lock invoice first, then request, so requests and approvals cannot race.
  const bill=await t.queryOne('SELECT i.*,s.name AS student_name FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.id = ? FOR UPDATE',[record.invoice_id]);
  const r=await t.queryOne('SELECT * FROM invoice_address_requests WHERE id = ? FOR UPDATE',[record.id]);
  if(!bill||!r||r.status!=='pending'||Number(bill.student_id)!==Number(r.student_id))throw new RequestError('This request has already been reviewed or is unavailable.');
  if(decision==='approve'&&(bill.status==='draft'||bill.status==='void'||bill.kind==='storno'))throw new RequestError('This invoice can no longer be corrected. Decline the request instead.');
  let revision=null;
  if(decision==='approve'){
   const v=await version(t,bill),base=Number(v?.revision||0);
   if(base!==Number(r.base_revision))throw new RequestError('The invoice version has changed. Reload and review the current version.');
   if((v?.billing_name||bill.billing_name)===wanted.name&&(v?.billing_address||bill.billing_address||'')===wanted.address)throw new RequestError('The approved address must differ from the current invoice.');
   revision=Math.max(base,1)+1;
   await t.query("INSERT INTO invoice_address_versions (invoice_id,revision,recipient,billing_name,billing_address,source,request_id) VALUES (?,?,?,?,?,'office',?)",[bill.id,revision,wanted.recipient,wanted.name,wanted.address,r.id]);
  }
  const status=decision==='approve'?'approved':'rejected';
  await t.query("UPDATE invoice_address_requests SET status = ?, review_note = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'",[status,note||null,r.id]);
  await queue(t,{...r,number:record.number},{name:record.student_name,email:record.student_email},status,{revision,final_name:wanted?.name,final_address:wanted?.address,review_note:note});
  await audit(t,bill.id,'invoice.address.'+status,{requestId:r.id,revision,note:note||null});
  return {status,revision,invoiceId:bill.id};
 });
}
module.exports={ready,RequestError,effective,history,target,submit,list,get,review};
