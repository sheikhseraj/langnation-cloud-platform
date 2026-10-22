'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {setInvite,getPrivateInvite,removeInvite}=require('../lib/community/manual-handoff');
const {encryptInvite,decryptInvite}=require('../lib/community/security');
process.env.COMMUNITY_ENCRYPTION_KEY='ef'.repeat(32);
const actor={userId:null,kind:'SHARED_ADMIN'},url='https://chat.whatsapp.com/SyntheticSecretInvite';
function fixture(configured=true){const group={id:42,invite_link_encrypted:configured?encryptInvite(url):null},events=[],writes=[];const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,params=[])=>{if(sql.startsWith('SELECT * FROM community_groups'))return [[group]];writes.push(sql);if(sql.startsWith('UPDATE community_groups'))group.invite_link_encrypted=params[0];if(sql.startsWith('INSERT INTO community_audit_logs'))events.push({action:params[2],metadata:JSON.parse(params[5])});return [{insertId:1,affectedRows:1}];}};return{group,events,writes,pool:{getConnection:async()=>conn}};}
test('blank replacement never removes a stored invite; only confirmed removal clears it',async()=>{
 const f=fixture();for(const inviteLink of ['',null,undefined,'   '])await assert.rejects(setInvite(42,{inviteLink},actor,f.pool),e=>e.status===400);
 assert.equal(decryptInvite(f.group.invite_link_encrypted),url);assert.equal(f.writes.length,0);
 for(const body of [{},{confirm:false},{confirm:'true'}])await assert.rejects(removeInvite(42,body,actor,f.pool),e=>e.status===400);
 await removeInvite(42,{confirm:true},actor,f.pool);assert.equal(f.group.invite_link_encrypted,null);assert.ok(f.events.some(e=>e.action==='GROUP_INVITE_REMOVED'));
});
test('admin retrieval/replacement uses the same encrypted group field and keeps URLs out of audit metadata',async()=>{
 const f=fixture();const out=await getPrivateInvite(42,actor,f.pool);assert.equal(out.inviteLink,url);assert.equal(out.hasInviteLink,true);
 const replacement=url+'2';await setInvite(42,{inviteLink:replacement},actor,f.pool);assert.equal(decryptInvite(f.group.invite_link_encrypted),replacement);assert.equal((await getPrivateInvite(42,actor,f.pool)).inviteLink,replacement);assert.doesNotMatch(JSON.stringify(f.events),/SyntheticSecretInvite|chat\.whatsapp/);
});
test('no-invite reads need no encryption key; configured invites report configuration errors',async()=>{
 const f=fixture(),empty=fixture(false),saved=process.env.COMMUNITY_ENCRYPTION_KEY;delete process.env.COMMUNITY_ENCRYPTION_KEY;
 try{assert.equal((await getPrivateInvite(42,actor,empty.pool)).inviteLink,null);await assert.rejects(getPrivateInvite(42,actor,f.pool),e=>e.status===503);assert.equal(f.events.length,0);}finally{process.env.COMMUNITY_ENCRYPTION_KEY=saved;}
});
const source=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
async function panel(configured=true){let mutation;const nodes=[],calls=[];function el(tag,text,attrs={}){const n={tag,text,attrs,hidden:Boolean(attrs.hidden),children:[],append(...children){this.children.push(...children);},prepend(...children){this.children.unshift(...children);},setAttribute(k,v){attrs[k]=v;}};nodes.push(n);return n;}
 const submit={},form={querySelector:()=>submit,insertBefore(){},closest:()=>({close(){}})},d=el('dialog');d.open=true;d.close=()=>d.open=false;
 const context={api:async(...args)=>{calls.push(args);return {inviteLink:url};},dialog:()=>d,el,add:(p,...children)=>{p.append(...children);return p;},btn:(text,action)=>{const n=el('button',text);n.action=action;return n;},mutation:(...args)=>{mutation=args;return form;},field(){},value:()=>url,message(){}};
 vm.createContext(context);const start=source.indexOf(' async function privateInvite('),end=source.indexOf(' async function groupDetail(',start);vm.runInContext(source.slice(start,end),context);await context.privateInvite({id:42,name:'Indians in Magdeburg',has_invite_link:configured});return{nodes,calls,d,submit,get mutation(){return mutation;}};
}
test('configured invite panel hides visible URL/input by default and has explicit actions',async()=>{
 const p=await panel();assert.ok(p.nodes.some(n=>n.text==='✓ Invite link configured'));assert.ok(!p.nodes.some(n=>n.tag==='input'));assert.ok(!p.nodes.some(n=>n.text===url));
 for(const label of ['Copy invite link','Open invite link','Replace invite link','Remove invite link','Show invite link'])assert.ok(p.nodes.some(n=>n.text===label));
 const show=p.nodes.find(n=>n.text==='Show invite link');show.action();assert.ok(p.nodes.some(n=>n.textContent===url&&!n.hidden));show.action();assert.ok(!p.nodes.some(n=>n.textContent===url));
 p.nodes.find(n=>n.text==='Remove invite link').action();assert.equal(p.mutation[1],'Remove the private invite link for Indians in Magdeburg?');assert.equal(p.submit.textContent,'Remove invite');await p.mutation[3]();assert.equal(p.calls.at(-1)[1],'DELETE');assert.equal(p.calls.at(-1)[2].confirm,true);
});
test('no-invite panel shows Add without decryption or removal actions',async()=>{
 const p=await panel(false);assert.equal(p.calls.length,0);assert.ok(p.nodes.some(n=>n.text==='No private invite link configured.'));assert.ok(p.nodes.some(n=>n.text==='Add invite link'));assert.ok(!p.nodes.some(n=>n.text==='Remove invite link'));p.nodes.find(n=>n.text==='Add invite link').action();assert.equal(p.submit.textContent,'Save new invite');assert.match(p.mutation[1],/only when you save/);
});
