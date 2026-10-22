'use strict';
// In-memory SQL fixture shared by request tests and isolated UI previews. No external services.
function createStore(){
 const state={student:{id:7,name:'Student Example',email:'student@example.invalid',student_ref:'LNS0007',address:'Personal Street 1',city:'10115 Berlin',country:'Germany',invoice_personal_address:null,invoice_company:'Example Employer GmbH',invoice_company_address:'Company Street 15\n10115 Berlin\nGermany'},invoice:{id:1,student_id:7,number:'2026-0001',kind:'invoice',billing_name:'Student Example',billing_address:'Personal Street 1\n10115 Berlin\nGermany',status:'paid',total:'250.00',paid_amount:'250.00',currency:'EUR',issued_on:'2026-10-02',due_on:'2026-10-02',paid_on:'2026-10-02'},versions:[],requests:[],notifications:[],audit:[],writes:[]};
 const joined=r=>({...r,student_name:state.student.name,student_email:state.student.email,student_ref:state.student.student_ref,number:state.invoice.number,...(()=>{const v=state.versions.find(v=>v.request_id===r.id);return v?{approved_name:v.billing_name,approved_address:v.billing_address,approved_revision:v.revision}:{};})()});
 async function query(sql,p=[]){
  const q=sql.replace(/\s+/g,' ').trim();
  if(q.startsWith('SELECT')){
   if(q.includes('FROM invoice_address_versions'))return state.versions.filter(v=>v.invoice_id===Number(p[0])).sort((a,b)=>b.revision-a.revision).slice(0,1);
   if(q.includes('FROM invoice_address_notifications')){
    let list=state.notifications;
    if(q.includes('sent_at IS NULL'))list=list.filter(n=>!n.sent_at&&n.next<=Date.now()&&(!n.lease_until||n.lease_until<Date.now()));
    if(q.includes('request_id = ?'))list=list.filter(n=>n.request_id===Number(p[0]));
    return q.includes('LIMIT 1')?list.slice(0,1):list;
   }
   if(q.includes('FROM invoice_address_requests')){
    if(q.includes('WHERE r.id = ?')||q.includes('WHERE id = ?'))return state.requests.filter(r=>r.id===Number(p[0])).map(joined);
    if(q.includes("status = 'pending'"))return state.requests.filter(r=>r.invoice_id===Number(p[0])&&r.status==='pending');
    if(q.includes('r.status = ?'))return state.requests.filter(r=>r.status===p[0]).map(joined);
    return state.requests.filter(r=>r.invoice_id===Number(p[0])&&r.student_id===Number(p[1])).map(joined).reverse();
   }
   if(q.includes('FROM students'))return Number(p[0])===state.student.id?[{...state.student}]:[];
   if(q.includes('FROM invoices')){
    if(Number(p[0])!==state.invoice.id||q.includes('i.student_id = ?')&&Number(p[1])!==state.invoice.student_id)return [];
    return [joined({...state.invoice})];
   }
   if(q.includes('FROM invoice_items'))return [{description:'German course — installment 1 of 3',quantity:1,unit_price:'250.00',amount:'250.00'}];
   if(q.includes('FROM payments'))return [];
   throw new Error('Unexpected SELECT in fixture: '+q);
  }
  state.writes.push([q,[...p]]);
  if(q.startsWith('INSERT INTO invoice_address_versions')){
   const office=q.includes("'office'");const v={id:state.versions.length+1,invoice_id:Number(p[0]),revision:office?Number(p[1]):1,recipient:office?p[2]:p[1],billing_name:office?p[3]:p[2],billing_address:office?p[4]:p[3],source:office?'office':p[4],request_id:office?p[5]:null,created_at:new Date()};
   if(state.versions.some(x=>x.invoice_id===v.invoice_id&&x.revision===v.revision))throw new Error('duplicate version');state.versions.push(v);return {insertId:v.id};
  }
  if(q.startsWith('INSERT INTO invoice_address_requests')){
   const keys=['invoice_id','student_id','base_revision','current_recipient','current_name','current_address','wanted_recipient','wanted_name','wanted_address'];const r=Object.fromEntries(keys.map((k,i)=>[k,p[i]]));r.id=state.requests.length+1;r.status='pending';r.created_at=new Date();state.requests.push(r);return {insertId:r.id};
  }
  if(q.startsWith('INSERT INTO invoice_address_notifications')){const n={id:state.notifications.length+1,request_id:p[0],event:p[1],to_email:p[2],to_name:p[3],payload:p[4],attempts:0,next:0,sent_at:null};state.notifications.push(n);return {insertId:n.id};}
  if(q.startsWith('INSERT INTO audit_log')){state.audit.push(p);return {insertId:state.audit.length};}
  if(q.startsWith('UPDATE invoice_address_requests')){const r=state.requests.find(r=>r.id===p[2]&&r.status==='pending');if(!r)return {affectedRows:0};Object.assign(r,{status:p[0],review_note:p[1],reviewed_at:new Date()});return {affectedRows:1};}
  if(q.startsWith('UPDATE invoice_address_notifications')){
   const claim=q.includes('attempts = attempts + 1'),n=state.notifications.find(n=>n.id===Number(claim?p[1]:q.includes('sent_at = NOW()')?p[0]:p[2]));
   if(!n)return {affectedRows:0};
   if(claim){n.lease_token=p[0];n.lease_until=Date.now()+600000;n.attempts++;}
   else if(q.includes('sent_at = NOW()')){if(n.lease_token!==p[1])return {affectedRows:0};n.sent_at=new Date();n.lease_token=null;n.lease_until=null;n.last_error=null;}
   else{if(n.lease_token!==p[3])return {affectedRows:0};n.next=Date.now()+p[0]*1000;n.last_error=p[1];n.lease_until=null;n.lease_token=null;}
   return {affectedRows:1};
  }
  if(q.startsWith('UPDATE students')){
   if(q.includes('invoice_company_address')){state.student.invoice_company=p[0];state.student.invoice_company_address=p[1];}
   else if(q.includes('invoice_personal_address'))state.student.invoice_personal_address=p[0];
   else throw new Error('Unexpected student update');return {affectedRows:1};
  }
  throw new Error('Unexpected write in fixture: '+q);
 }
 const queryOne=async(q,p)=>(await query(q,p))[0]||null;
 let tail=Promise.resolve();
 async function transaction(fn){const previous=tail;let release;tail=new Promise(r=>release=r);await previous;const before=structuredClone(state);try{return await fn({query,queryOne});}catch(e){for(const k of Object.keys(state))state[k]=before[k];throw e;}finally{release();}}
 function install(db){const old={isEnabled:db.isEnabled,hasColumn:db.hasColumn,query:db.query,queryOne:db.queryOne,transaction:db.transaction};Object.assign(db,{isEnabled:()=>true,hasColumn:k=>!k.startsWith('sent_emails'),query,queryOne,transaction});return ()=>Object.assign(db,old);}
 return {state,query,queryOne,transaction,install};
}
module.exports={createStore};
