'use strict';
const crypto=require('crypto'),db=require('./db'),mailer=require('./mailer'),T=require('./mail-template'),site=require('./site'),sent=require('./sent');
const ready=()=>db.isEnabled()&&db.hasColumn('invoice_address_notifications.id');
function message(row){
 const p=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;
 const approved=row.event==='approved',rejected=row.event==='rejected';
 const title=approved?'Your invoice address has been updated':rejected?'Invoice address request reviewed':'Invoice address request received';
 const lead=approved?'The office approved an address correction. The replacement invoice is ready in your portal. Previous copies are superseded and must no longer be used.':rejected?'The office declined this address change. Your current invoice remains unchanged.':'We received your request. Your issued invoice stays unchanged until the office approves a replacement.';
 const pairs=[['Invoice',p.number],['Request',String(row.request_id)],['Previous recipient',p.current_name],['Previous address',p.current_address||'Not recorded'],[approved?'Approved recipient':'Requested recipient',approved?p.final_name:p.wanted_name],[approved?'Approved address':'Requested address',approved?p.final_address:p.wanted_address]];
 if(p.revision)pairs.push(['Invoice version',String(p.revision)]);
 if(p.review_note)pairs.push(['Office note',p.review_note]);
 const link=site.origin+'/portal/payments/invoice/'+p.invoice_id;
 return {to:row.to_email,subject:'LangNation — '+title+' ('+p.number+')',text:T.text(['Hello '+row.to_name+',','',lead,'',...pairs.map(([k,v])=>k+': '+(v||'')),'',link]),html:T.wrap({title,body:T.p('Hello '+T.escapeHtml(row.to_name)+',')+T.p(T.escapeHtml(lead))+T.details(pairs).replace(/<strong>/g,'<strong style="white-space:pre-line">')+T.button(approved?'Open replacement invoice':'View invoice and request',link),footer:'LangNation · Invoice address requests'})};
}
let busy=false,timer;
async function flush(requestId=null){
 if(busy||!ready()||!mailer.isConfigured())return {sent:0,failed:0};
 busy=true;let delivered=0,failed=0;
 try{
  for(let i=0;i<10;i++){
   const token=crypto.randomBytes(24).toString('hex');
   const row=await db.transaction(async t=>{
    const r=await t.queryOne('SELECT * FROM invoice_address_notifications WHERE sent_at IS NULL AND next_attempt_at <= NOW() AND (lease_until IS NULL OR lease_until < NOW())'+(requestId?' AND request_id = ?':'')+' ORDER BY id LIMIT 1 FOR UPDATE',requestId?[requestId]:[]);
    if(!r)return null;
    await t.query('UPDATE invoice_address_notifications SET lease_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE), lease_token = ?, attempts = attempts + 1 WHERE id = ?',[token,r.id]);
    return r;
   });
   if(!row)break;
   let result,msg;
   try{msg=message(row);result=await mailer.send(msg);}catch(e){result={sent:false,reason:e.message};}
   if(result?.sent){
    await db.query('UPDATE invoice_address_notifications SET sent_at = NOW(), lease_until = NULL, lease_token = NULL, last_error = NULL WHERE id = ? AND lease_token = ?',[row.id,token]);
    await sent.record({to:row.to_email,name:row.to_name,subject:msg.subject,body:msg.text,by:'Invoice address notification'});
    delivered++;
   }else{
    const delay=Math.min(3600,60*Math.pow(2,Math.min(Number(row.attempts)||0,6)));
    await db.query('UPDATE invoice_address_notifications SET lease_until = NULL, lease_token = NULL, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_error = ? WHERE id = ? AND lease_token = ?',[delay,String(result?.reason||'Email send failed').slice(0,255),row.id,token]);failed++;
   }
  }
 }finally{busy=false;}
 return {sent:delivered,failed};
}
function start(){if(timer)return;const run=()=>flush().catch(e=>console.error('Invoice address email queue:',e.message));run();timer=setInterval(run,60000);timer.unref?.();}
async function status(requestId){if(!ready())return [];return db.query('SELECT event,sent_at,attempts,last_error FROM invoice_address_notifications WHERE request_id = ? ORDER BY id',[requestId]);}
module.exports={message,flush,start,status};
