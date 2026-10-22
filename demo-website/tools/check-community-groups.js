'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {groupInput,changeGroup,changeMembership}=require('../lib/community/moderation');
const {inviteLink}=require('../lib/community/validation');
const {decryptInvite}=require('../lib/community/security');
const {handoff,removeInvite}=require('../lib/community/manual-handoff');
const actor={userId:null,kind:'SHARED_ADMIN'},invite='https://chat.whatsapp.com/SyntheticInviteABC';
process.env.COMMUNITY_ENCRYPTION_KEY='cd'.repeat(32);
function fixture({duplicate=false}={}){
 const writes=[],events=[],group={id:42,name:'Existing group',slug:'stable-slug',city:'Berlin',status:'ACTIVE',is_public:false,accepting_applications:false,description:'Existing description',invite_link_encrypted:null};let rolledBack=0,committed=0;
 const conn={beginTransaction:async()=>{},commit:async()=>{committed++;},rollback:async()=>{rolledBack++;},release(){},execute:async(sql,params=[])=>{
  if(sql.startsWith('SELECT * FROM community_groups'))return [[group]];
  if(sql.startsWith('SELECT * FROM community_join_requests'))return [[{id:8,member_id:7,group_id:42,status:'APPROVED',handoff_status:'PENDING',full_name:'Amit Kumar',normalized_phone:'+4917612345678'}]];
  if(sql.startsWith('SELECT * FROM community_members'))return [[{id:7}]];
  if(sql.includes('COUNT(*) AS total'))return [[{total:0,recent:0,rejected:0}]];
  writes.push({sql,params});
  if(sql.startsWith('INSERT INTO community_groups')){if(duplicate){const e=Error('Duplicate');e.code='ER_DUP_ENTRY';throw e;}const fields=sql.match(/\((.*?)\)/)[1].split(', ');fields.forEach((k,i)=>group[k]=params[i]);return [{insertId:42}];}
  if(sql.startsWith('UPDATE community_groups')){const fields=sql.match(/SET (.*) WHERE/)[1].split(', ').map(p=>p.split(' = ')[0]);fields.forEach((k,i)=>group[k]=params[i]);return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO community_audit_logs'))events.push({name:params[2],metadata:JSON.parse(params[5])});return [{insertId:1}];
 }};
 return {group,writes,events,pool:{getConnection:async()=>conn},get committed(){return committed;},get rolledBack(){return rolledBack;}};
}
const valid={name:'Indians in Berlin',slug:'indians-in-berlin',city:'Berlin'};
test('group validation requires trimmed name, URL-safe slug and city, with optional bounded description',()=>{
 assert.equal(groupInput({...valid,name:' Indians in Berlin ',slug:' indians-in-berlin '}).slug,'indians-in-berlin');
 assert.equal(groupInput({...valid,description:'  '}).description,'');
 for(const patch of [{name:''},{slug:''},{slug:'Berlin GROUP'},{slug:'../berlin'},{city:''},{approximate_capacity:0},{approximate_capacity:1.5},{current_member_count:-1},{description:'x'.repeat(4001)},{instructions:'x'.repeat(4001)}])assert.throws(()=>groupInput({...valid,...patch}));
});
test('private invites accept only HTTPS WhatsApp group URLs, without any verification request',()=>{
 assert.equal(inviteLink(' '+invite+' '),invite);assert.equal(inviteLink(''),null);assert.equal(inviteLink(invite+'?mode=invite'),invite+'?mode=invite');
 for(const url of ['http://chat.whatsapp.com/code','https://evil.example/code','https://chat.whatsapp.com.evil.example/code','https://user:pass@chat.whatsapp.com/code','javascript:alert(1)','https://chat.whatsapp.com/','https://chat.whatsapp.com/a/b'])assert.throws(()=>inviteLink(url));
});
test('create saves encrypted group invite atomically and supplies recommended availability defaults',async()=>{
 const f=fixture(),out=await changeGroup(null,{...valid,inviteLink:invite,approximate_capacity:1024,current_member_count:1100,instructions:'Add or invite this approved member manually.'},actor,f.pool);
 assert.equal(out.id,42);assert.equal(out.warnings.length,1);assert.equal(f.group.status,'ACTIVE');assert.equal(f.group.is_public,true);assert.equal(f.group.accepting_applications,true);assert.equal(f.group.description,'');assert.equal(decryptInvite(f.group.invite_link_encrypted),invite);
 assert.ok(!f.group.invite_link_encrypted.includes(invite));assert.ok(f.events.some(x=>x.name==='GROUP_CREATED'));assert.ok(!JSON.stringify(f.events).includes(invite));assert.equal(f.committed,1);
 const approved=await handoff(8,actor,f.pool);assert.equal(approved.group.id,42);assert.ok(approved.approvalMessage.includes(valid.name));assert.ok(approved.approvalMessage.includes(invite));assert.equal(approved.instructions,'Add or invite this approved member manually.');
});
test('edits preserve slug/visibility/invite unless explicitly changed, and archive is separately audited',async()=>{
 const f=fixture();await changeGroup(42,{name:'Renamed group',inviteLink:invite},actor,f.pool);await changeGroup(42,{description:'New public description'},actor,f.pool);
 assert.equal(f.group.slug,'stable-slug');assert.equal(f.group.is_public,false);assert.equal(f.group.accepting_applications,false);assert.equal(decryptInvite(f.group.invite_link_encrypted),invite);assert.ok(f.events.some(x=>x.name==='GROUP_UPDATED'));
 await changeGroup(42,{status:'ARCHIVED',inviteLink:''},actor,f.pool);assert.equal(decryptInvite(f.group.invite_link_encrypted),invite);await removeInvite(42,{confirm:true},actor,f.pool);assert.equal(f.group.invite_link_encrypted,null);assert.ok(f.events.some(x=>x.name==='GROUP_ARCHIVED'));
});
test('missing encryption key and duplicate slug cannot leave half-created groups',async()=>{
 const saved=process.env.COMMUNITY_ENCRYPTION_KEY;delete process.env.COMMUNITY_ENCRYPTION_KEY;const f=fixture();try{await assert.rejects(changeGroup(null,{...valid,inviteLink:invite},actor,f.pool),e=>e.status===503);assert.equal(f.writes.length,0);}finally{process.env.COMMUNITY_ENCRYPTION_KEY=saved;}
 const duplicate=fixture({duplicate:true});await assert.rejects(changeGroup(null,{...valid,invite_delivery_mode:'MANUAL'},actor,duplicate.pool),e=>e.status===409&&/slug.*already used/.test(e.message));assert.equal(duplicate.rolledBack,1);assert.equal(duplicate.committed,0);assert.equal(duplicate.events.length,0);
});
test('manual membership edit cannot bypass the Record actual admission workflow',async()=>{
 await assert.rejects(changeMembership(42,{status:'ACTIVE'},actor),e=>e.status===409&&/Record actual admission/.test(e.message));
});
const source=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
function formFixture(group){
 const inputs={},nodes=[];let send,done;const submit={textContent:'',setAttribute(){},remove(){}};
 const form={addEventListener(){},append(...children){nodes.push(...children);},querySelector:()=>submit,closest:()=>({close(){}})};
 const context={settings:{group_policy:'INHERIT'},mutation:(_title,_desc,fields,save,onDone)=>{fields(form);send=save;done=onDone;return form;},el:(tag,text,attrs={})=>({tag,text,attrs,append(){}}),add:(parent,...children)=>{parent.append(...children);return parent;},field:(_f,name,label,opts={})=>{const item={parentNode:{hidden:false},name,label,opts,value:opts.value??'',events:{},addEventListener(event,fn){this.events[event]=fn;}};inputs[name]=item;return item;},toggle:(_f,name,label,checked)=>{inputs[name]={name,label,checked};},btn:(text,action)=>({text,action}),value:(_f,name)=>inputs[name]?.value,checked:(_f,name)=>inputs[name]?.checked===true,api:async()=>({id:42}),groupDetail(){},message(){},Error};
 vm.createContext(context);const start=source.indexOf(' function generatedGroupSlug('),end=source.indexOf(' async function groupDetail(',start);vm.runInContext(source.slice(start,end),context);context.groupForm(group);
 return {inputs,nodes,submit,context,get send(){return send;},get done(){return done;}};
}
test('new-group slug follows name until manually edited; existing group slug never follows name',()=>{
 const f=formFixture({});f.inputs.name.value='Indians in Magdeburg';f.inputs.name.events.input();assert.equal(f.inputs.slug.value,'indians-in-magdeburg');assert.equal(f.submit.textContent,'Create Group');assert.equal(f.inputs.is_public.checked,true);assert.equal(f.inputs.accepting_applications.checked,true);
 f.inputs.slug.value='my-chosen-slug';f.inputs.slug.events.input();f.inputs.name.value='Indians in Berlin';f.inputs.name.events.input();assert.equal(f.inputs.slug.value,'my-chosen-slug');assert.equal(f.context.generatedGroupSlug(' Köln & Düsseldorf '),'koln-dusseldorf');
 const existing=formFixture({id:42,name:'Old name',slug:'stable-slug',is_public:false,accepting_applications:false});assert.equal(existing.inputs.slug.value,'stable-slug');assert.equal(existing.inputs.name.events.input,undefined);assert.equal(existing.inputs.is_public.checked,false);
});
test('group form sends no replacement for an existing invite when left blank',async()=>{
 const f=formFixture({id:42,name:'Existing',slug:'stable',city:'Berlin',has_invite_link:true});f.inputs.approximate_capacity.value='';f.inputs.current_member_count.value='';let call;f.context.api=async(...args)=>{call=args;return {id:42};};await f.send({});assert.ok(!('inviteLink' in call[2]));
 assert.equal(f.inputs.inviteLink,undefined);assert.equal(f.inputs.removeInvite,undefined);
});

const {TEMPLATES,handoffMethod}=require('../lib/community/handoff-method');
test('new handoff defaults to Standard, requires an invite, and Manual/Custom validate separately',async()=>{
 const standard=fixture();await changeGroup(null,{...valid,inviteLink:invite},actor,standard.pool);assert.equal(standard.group.invite_delivery_mode,'STANDARD');assert.equal(standard.group.instructions,TEMPLATES.STANDARD);
 const invalid=fixture();await assert.rejects(changeGroup(null,valid,actor,invalid.pool),e=>e.status===400&&/requires a private/.test(e.message));assert.ok(!invalid.writes.some(w=>w.sql.startsWith('INSERT INTO community_groups')));
 const manual=fixture();await changeGroup(null,{...valid,invite_delivery_mode:'MANUAL'},actor,manual.pool);assert.equal(manual.group.instructions,TEMPLATES.MANUAL);assert.equal(handoffMethod(manual.group),'MANUAL');
 const custom=fixture();await assert.rejects(changeGroup(null,{...valid,invite_delivery_mode:'CUSTOM',instructions:''},actor,custom.pool),e=>e.status===400);await changeGroup(null,{...valid,invite_delivery_mode:'CUSTOM',instructions:'Contact the city moderator first.'},actor,custom.pool);assert.equal(custom.group.instructions,'Contact the city moderator first.');
});
test('legacy handoff instructions are preserved without schema or bulk data changes',async()=>{
 const f=fixture();f.group.instructions='Ask the local admin to check availability first.';f.group.invite_delivery_mode='MANUAL';assert.equal(handoffMethod(f.group),'CUSTOM');await changeGroup(42,{name:'Updated name'},actor,f.pool);assert.equal(f.group.instructions,'Ask the local admin to check availability first.');assert.equal(f.group.invite_delivery_mode,'MANUAL');
 assert.equal(handoffMethod({invite_delivery_mode:'MANUAL',instructions:null,invite_link_encrypted:'cipher'}),'STANDARD');assert.equal(handoffMethod({invite_delivery_mode:'MANUAL',instructions:null}),'MANUAL');assert.equal(handoffMethod({instructions:TEMPLATES.MANUAL,invite_link_encrypted:'cipher'}),'MANUAL');
});
test('handoff dropdown defaults to Standard and shows required textarea only for Custom',()=>{
 const f=formFixture({});assert.equal(f.inputs.invite_delivery_mode.value,'STANDARD');assert.equal(f.inputs.instructions.parentNode.hidden,true);assert.equal(f.inputs.instructions.disabled,true);f.inputs.invite_delivery_mode.value='CUSTOM';f.inputs.invite_delivery_mode.events.change();assert.equal(f.inputs.instructions.parentNode.hidden,false);assert.equal(f.inputs.instructions.required,true);f.inputs.invite_delivery_mode.value='MANUAL';f.inputs.invite_delivery_mode.events.change();assert.equal(f.inputs.instructions.parentNode.hidden,true);
 const existing=formFixture({id:42,instructions:'Special city instructions',handoff_method:'CUSTOM'});assert.equal(existing.inputs.invite_delivery_mode.value,'CUSTOM');assert.equal(existing.inputs.instructions.value,'Special city instructions');
});
