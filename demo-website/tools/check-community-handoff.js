'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {approvalMessage,clickToChat,handoff}=require('../lib/community/manual-handoff');
const {encryptInvite}=require('../lib/community/security');
const {publicGroup,safeGroup}=require('../lib/community/repository');
const actor={userId:null,kind:'SHARED_ADMIN'};
process.env.COMMUNITY_ENCRYPTION_KEY='bc'.repeat(32);
const invite='https://chat.whatsapp.com/SyntheticPrivateInvite123';
function fixture({status='APPROVED',blocked=false,anonymized=false,groupStatus='ACTIVE',withInvite=true}={}){
 const writes=[],request={id:12,member_id:7,group_id:2,full_name:'Priya van Example',normalized_phone:'+4917612345678',status,handoff_status:'PENDING'};
 const group={id:2,name:'Neighbours in Berlin',status:groupStatus,invite_link_encrypted:withInvite?encryptInvite(invite):null};
 const connection={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,values=[])=>{
  if(sql.startsWith('SELECT * FROM community_join_requests'))return [[request]];
  if(sql.startsWith('SELECT * FROM community_members'))return [[{id:7,anonymized_at:anonymized?new Date():null}]];
  if(sql.startsWith('SELECT * FROM community_groups'))return [[group]];
  if(sql.includes('FROM community_blocks'))return [[{total:blocked?1:0}]];
  if(sql.includes('COUNT(*) AS total'))return [[{total:0,recent:0,rejected:0}]];
  writes.push({sql,values});return [{insertId:1}];
 }};
 return {pool:{getConnection:async()=>connection},writes,request,group};
}
test('approval message uses the first name and selected group, including that group invite',()=>{
 const text=approvalMessage('  Priya   van Example  ','Neighbours in Berlin',invite);
 assert.match(text,/^Hi Priya,\n\n/);assert.match(text,/your request to join Neighbours in Berlin has been approved/);assert.ok(text.includes(invite));assert.match(text,/do not share the invitation link with unknown people/);assert.ok(text.endsWith('Welcome to the community!\nLangNation Team'));
 assert.ok(approvalMessage('Amit Kumar','Indians in Hannover',null).includes('Indians in Hannover'));assert.ok(!text.includes('Hannover'));
});
test('missing invite generates the manual-add message without a link or fake placeholder',()=>{
 const text=approvalMessage('Amit Kumar','Helpful Neighbours',null);assert.match(text,/Hi Amit/);assert.match(text,/I will add you to the WhatsApp group manually/);assert.match(text,/follow the community rules once you join/);assert.doesNotMatch(text,/https?:|\[Private|undefined|null/);
});
test('standard click-to-chat URL round-trips Unicode, newlines and private invite without sending',()=>{
 const text=approvalMessage('José Álvarez','Köln & Friends',invite),url=new URL(clickToChat('+49 (176) 1234-5678',text));
 assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/4917612345678');assert.equal(url.searchParams.get('text'),text);
 for(const phone of [null,'017612345678','+49/../../x','javascript:alert(1)'])assert.equal(clickToChat(phone,text),null);
});
test('protected handoff returns generated content and safe group, but makes no admission writes or message audits',async()=>{
 const f=fixture(),out=await handoff(12,actor,f.pool);assert.equal(out.inviteLink,invite);assert.equal(out.approvalMessage,approvalMessage('Priya van Example',f.group.name,invite));assert.equal(new URL(out.whatsappUrl).searchParams.get('text'),out.approvalMessage);assert.equal(out.whatsappMembershipVerified,false);assert.equal(f.request.handoff_status,'PENDING');assert.ok(!('invite_link_encrypted' in out.group));
 assert.equal(f.writes.length,1);assert.match(f.writes[0].sql,/INSERT INTO community_audit_logs/);assert.doesNotMatch(JSON.stringify(f.writes),/SyntheticPrivateInvite123|Hi Priya|wa\.me/);
 assert.ok(!JSON.stringify(publicGroup({...f.group,...out})).includes(invite));assert.ok(!JSON.stringify(safeGroup(f.group)).includes(invite));
 const without=await handoff(12,actor,fixture({withInvite:false}).pool);assert.equal(without.inviteLink,null);assert.match(without.approvalMessage,/add you.*manually/);
});
test('unapproved, blocked, anonymized or inactive-group requests cannot reveal an invite or message',async()=>{
 for(const options of [{status:'PENDING'},{status:'REVIEW'},{status:'REJECTED'},{blocked:true},{anonymized:true},{groupStatus:'ARCHIVED'}]){const f=fixture(options);await assert.rejects(handoff(12,actor,f.pool),e=>e.status===409);assert.equal(f.writes.length,0);}
});

// Execute the actual shared copy component in a small DOM fixture. No browser,
// WhatsApp session, UI automation package or new dependency is used.
const browserSource=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
test('shared clipboard handles dynamically created buttons and reports message copy success safely',async()=>{
 const start=browserSource.indexOf('  (function copyButtons()'),end=browserSource.indexOf('  /* ── Rails',start);
 let listener,copied;const live={textContent:''},attrs={'data-copy':'Complete synthetic message\n'+invite,'data-copy-label':'Message'},button={disabled:false,getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],closest:()=>({querySelector:()=>live})};
 vm.runInNewContext(browserSource.slice(start,end),{document:{addEventListener:(event,fn)=>listener=fn},navigator:{clipboard:{writeText:async value=>{copied=value;}}},window:{isSecureContext:true,setTimeout(){}},Promise});
 listener({target:{closest:()=>button}});await Promise.resolve();await Promise.resolve();
 assert.equal(copied,attrs['data-copy']);assert.equal(live.textContent,'Message copied');assert.equal(attrs['data-copied'],'yes');assert.ok(!live.textContent.includes(invite));
});
test('shared copy fallback reports failure honestly without claiming success',()=>{
 const start=browserSource.indexOf('  (function copyButtons()'),end=browserSource.indexOf('  /* ── Rails',start);let listener;const live={textContent:''},attrs={'data-copy':'Synthetic approval message','data-copy-label':'Message'},button={getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,removeAttribute(){},closest:()=>({querySelector:()=>live})};
 const document={addEventListener:(_event,fn)=>listener=fn,createElement:()=>({setAttribute(){},style:{},select(){}}),body:{appendChild(){},removeChild(){}},execCommand:()=>false};
 vm.runInNewContext(browserSource.slice(start,end),{document,navigator:{},window:{isSecureContext:false,setTimeout(){}}});listener({target:{closest:()=>button}});
 assert.equal(live.textContent,'Could not copy');assert.equal(attrs['data-copied'],'no');
});
test('handoff dialog exposes required controls and reading it never posts admission',async()=>{
 const start=browserSource.indexOf(' async function openHandoff('),end=browserSource.indexOf(' function note(',start);
 const nodes=[],calls=[];function node(tag,text,attrs={}){const n={tag,text,attrs,value:'',children:[],append(...items){this.children.push(...items);},setAttribute(k,v){this.attrs[k]=v;}};nodes.push(n);return n;}
 let dialog,mutation;
 const payload={fullName:'Priya Example',phone:'+4917612345678',group:{name:'Berlin Friends'},inviteLink:invite,approvalMessage:approvalMessage('Priya Example','Berlin Friends',invite),whatsappUrl:clickToChat('+4917612345678','Synthetic text'),whatsappMembershipVerified:false,instructions:'Send manually.'};
 const context={api:async(...args)=>{calls.push(args);return payload;},dialog:title=>(dialog=node('dialog',title)),el:node,details:(title,data)=>node('details',title,{data}),btn:(text,action)=>node('button',text,{action}),add:(parent,...children)=>{parent.append(...children);return parent;},message(){},mutation:(...args)=>{mutation=args;},toggle(){},checked:()=>true,Error};
 vm.createContext(context);vm.runInContext(browserSource.slice(start,end),context);await context.openHandoff(12);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'join-requests/12/handoff');assert.equal(calls[0].length,1);
 const copy=nodes.find(n=>n.text==='Copy message');assert.equal(copy.attrs['data-copy'],payload.approvalMessage);assert.ok(nodes.some(n=>n.text==='Copy invite link'));
 const link=nodes.find(n=>n.text==='Open WhatsApp');assert.equal(link.tag,'a');assert.equal(link.attrs.href,payload.whatsappUrl);assert.equal(link.attrs.rel,'noopener noreferrer');assert.equal(link.attrs.referrerpolicy,'no-referrer');
 assert.ok(nodes.some(n=>n.tag==='textarea'&&n.value===payload.approvalMessage&&n.attrs.readonly));
 dialog.close=()=>{};nodes.find(n=>n.text==='Record actual admission').attrs.action();assert.equal(calls.length,1);assert.equal(mutation[0],'record admission');await mutation[3]({});assert.equal(calls[1][0],'join-requests/12/handoff-complete');assert.equal(calls[1][1],'POST');assert.equal(calls[1][2].admissionConfirmed,true);
 nodes.length=0;payload.inviteLink=null;payload.whatsappMembershipVerified=true;await context.openHandoff(12);assert.ok(!nodes.some(n=>n.text==='Copy invite link'));assert.ok(!nodes.some(n=>n.text==='Record actual admission'));
});

test('Manual handoff never decrypts/exposes stored invite and Custom retains admin instructions',async()=>{
 const {TEMPLATES}=require('../lib/community/handoff-method');const f=fixture();f.group.invite_delivery_mode='MANUAL';f.group.instructions=TEMPLATES.MANUAL;const saved=process.env.COMMUNITY_ENCRYPTION_KEY;delete process.env.COMMUNITY_ENCRYPTION_KEY;try{const out=await handoff(12,actor,f.pool);assert.equal(out.mode,'MANUAL');assert.equal(out.inviteLink,null);assert.match(out.approvalMessage,/add you.*manually/);assert.doesNotMatch(JSON.stringify(out),/SyntheticPrivateInvite/);}finally{process.env.COMMUNITY_ENCRYPTION_KEY=saved;}
 const custom=fixture();custom.group.instructions='Confirm the city with the local moderator.';const out=await handoff(12,actor,custom.pool);assert.equal(out.mode,'CUSTOM');assert.equal(out.instructions,custom.group.instructions);assert.equal(out.inviteLink,invite);
 const missing=fixture({withInvite:false});missing.group.invite_delivery_mode='STANDARD';await assert.rejects(handoff(12,actor,missing.pool),e=>e.status===409&&/configured private invite/.test(e.message));assert.equal(missing.writes.length,0);
});
