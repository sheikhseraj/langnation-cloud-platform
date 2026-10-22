'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {changeSettings}=require('../lib/community/settings');
const {policies,effectiveRules,approvedPostExempt}=require('../lib/community/policy');
const {ruleBasedAssessment}=require('../lib/community/screening');
const {createReport,issueWarning,blockMember}=require('../lib/community/moderation');
const defaults=require('../lib/community/defaults');
const actor={userId:null,kind:'SHARED_ADMIN'};
process.env.SESSION_SECRET='settings-test-secret-of-at-least-32-characters';process.env.ADMIN_PASSWORD_HASH='synthetic-configured-hash';
function fixture(){
 const config={...defaults,id:1,notification_preferences:{dashboard:true,applicantDelivery:'MANUAL'},rules_text:'Existing custom rules',privacy_text:'Existing custom notice',rules_version:'1.0',privacy_version:'1.0'};
 const events=[],writes=[];let committed=0,rolledBack=0;
 const connection={beginTransaction:async()=>{},commit:async()=>{committed++;},rollback:async()=>{rolledBack++;},release(){},execute:async(sql,values=[])=>{
  if(sql.includes('SELECT * FROM community_settings'))return [[config]];
  if(sql.includes('SELECT * FROM community_groups'))return [[{id:1,status:'ACTIVE',is_public:1}]];
  if(sql.includes('SELECT * FROM community_members'))return [[{id:7}]];
  if(sql.includes('SELECT * FROM community_reports'))return [[{id:3,group_id:1,reported_member_id:7,approved_admin_post:1,admin_post_type:'COURSE_PROMOTION'}]];
  if(sql.startsWith('UPDATE community_settings')){const names=sql.match(/SET (.*) WHERE/)[1].split(', ').map(x=>x.split(' = ')[0]);names.forEach((k,i)=>{config[k]=values[i];});return [{affectedRows:1}];}
  writes.push({sql,values});if(sql.startsWith('INSERT INTO community_audit_logs'))events.push({event:values[2],metadata:JSON.parse(values[5])});return [{insertId:3}];
 }};
 return {pool:{getConnection:async()=>connection},config,events,writes,get committed(){return committed;},get rolledBack(){return rolledBack;}};
}
test('settings persist new policies in existing JSON, preserve custom content and audit safe fields',async()=>{
 const f=fixture();const out=await changeSettings({group_policy:'CUSTOM',admin_promotional_policy:{announcements:true,coursePromotions:false,exemptApprovedPosts:true},notification_preferences:{dashboard:false,applicantDelivery:'MANUAL'}},actor,f.pool);
 assert.equal(out.success,true);assert.equal(out.settings.rules_text,'Existing custom rules');assert.equal(out.settings.privacy_text,'Existing custom notice');assert.equal(policies(out.settings).group_policy,'CUSTOM');assert.equal(f.committed,1);
 assert.ok(f.events.some(x=>x.event==='ADMIN_PROMOTIONAL_POLICY_CHANGED'));assert.ok(!JSON.stringify(f.events).includes('Existing custom'));
 const second=await changeSettings({notification_preferences:{dashboard:true,applicantDelivery:'MANUAL'}},actor,f.pool);assert.equal(policies(second.settings).group_policy,'CUSTOM');
});
test('changed rules/privacy require new versions and save distinct audit events',async()=>{
 const f=fixture();await assert.rejects(changeSettings({rules_text:'Changed rules'},actor,f.pool),e=>e.status===400);assert.equal(f.rolledBack,1);
 await changeSettings({rules_text:'Changed rules',rules_version:'1.1',privacy_text:'Changed notice',privacy_version:'1.1',low_risk_threshold:0,high_risk_threshold:100,warning_policy:['WARNING','REMOVAL_RECOMMENDED']},actor,f.pool);
 for(const name of ['RULES_CHANGED','PRIVACY_NOTICE_CHANGED','RISK_THRESHOLDS_CHANGED','WARNING_POLICY_CHANGED'])assert.ok(f.events.some(x=>x.event===name));
});
test('settings reject invalid limits, empty enabled text, markup and automatic blocking',async()=>{
 for(const body of [{low_risk_threshold:101},{high_risk_threshold:-1},{low_risk_threshold:60,high_risk_threshold:60},{retention_days:0},{warning_policy:Array(6).fill('WARNING')},{warning_policy:['BLOCKED']},{screening_patterns:['<script>']},{rules_text:''},{privacy_text:''},{ai_enabled:true}]){const f=fixture();await assert.rejects(changeSettings(body,actor,f.pool));assert.equal(f.committed,0);}
});
test('custom group rules extend global rules and bind acceptance to content/version changes',()=>{
 const f=fixture();f.config.notification_preferences.communityPolicy={groupPolicy:'CUSTOM'};const group={id:1,custom_rules:'No unrelated city posts.',custom_rules_version:'1.0'};
 const one=effectiveRules(group,f.config);assert.match(one.rules,/Existing custom rules/);assert.match(one.rules,/No unrelated city posts/);assert.notEqual(one.rulesVersion,effectiveRules({...group,custom_rules_version:'1.1'},f.config).rulesVersion);
 f.config.notification_preferences.communityPolicy.groupPolicy='INHERIT';assert.equal(effectiveRules(group,f.config).rulesVersion,'1.0');assert.equal(effectiveRules(group,f.config).customRules,'');
});
test('approved admin post exemptions depend on authenticated classification and policy',async()=>{
 const f=fixture();assert.equal(approvedPostExempt({approved_admin_post:1,admin_post_type:'COURSE_PROMOTION'},f.config),true);
 await assert.rejects(issueWarning({memberId:7,groupId:1,reportId:3,reason:'An ordinary advertisement warning'},actor,f.pool),e=>e.status===409);
 await assert.rejects(blockMember({memberId:7,groupId:1,reportId:3,reason:'An ordinary advertisement block'},actor,f.pool),e=>e.status===409);
 f.config.notification_preferences.communityPolicy={adminPromotions:{coursePromotions:false}};assert.equal(approvedPostExempt({approved_admin_post:1,admin_post_type:'COURSE_PROMOTION'},f.config),false);
 f.config.public_reporting_enabled=true;await createReport({groupId:1,category:'ADVERTISEMENT',description:'A public report about a relevant message.',privacyAccepted:true,privacyVersion:'1.0',approvedAdminPost:true,adminPostType:'COURSE_PROMOTION'},null,true,f.pool);
 const insertion=f.writes.find(x=>x.sql.startsWith('INSERT INTO community_reports'));const columns=insertion.sql.match(/\((.*?)\)/)[1].split(', ');assert.equal(insertion.values[columns.indexOf('approved_admin_post')],false);
});
test('advertisement patterns alone never recommend rejection despite other history risk',()=>{
 const out=ruleBasedAssessment({reason:'Please contact me for details about the city.'},{recentRequests:4,spamWarnings:3},{...defaults});assert.ok(out.riskScore>60);assert.equal(out.recommendation,'REVIEW');
 assert.equal(defaults.screening_patterns.length,20);assert.equal(defaults.ai_enabled,false);assert.equal(defaults.rules_version,'1.0');
});
