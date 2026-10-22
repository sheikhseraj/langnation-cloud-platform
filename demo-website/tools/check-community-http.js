'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),cookieParser=require('cookie-parser'),{once}=require('node:events'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
process.env.SESSION_SECRET='community-tests-only-stable-secret-at-least-32-characters';
process.env.ADMIN_PASSWORD='community-test-password-only';
process.env.DB_HOST='';process.env.DB_USER='';process.env.DB_NAME='';process.env.SMTP_HOST='';
const {createAdminRouter}=require('../lib/community/admin-router'),{createPublicRouter}=require('../lib/community/public-router');
const {compatibleRouter,communityErrors}=require('../lib/community/security'),csrf=require('../lib/csrf');
const config={feature_enabled:1,applications_enabled:1,rules_text:'Respect and helpfulness',rules_version:'2',privacy_text:'Synthetic privacy notice',privacy_version:'2',public_reporting_enabled:0};
const token='a'.repeat(64),headers={'Content-Type':'application/json','X-CSRF-Token':token,Cookie:'ln_csrf='+token};
const application={fullName:'Example Applicant',phone:'+4917612345678',city:'Berlin',groupId:1,reason:'I want to meet neighbours and share local advice.',rulesAccepted:true,privacyAccepted:true,rulesVersion:'2',privacyVersion:'2'};
async function serve(t,app){const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));return 'http://127.0.0.1:'+server.address().port;}
test('all admin operation families use the existing office cookie guard before database access',async t=>{
 const app=express();app.use(cookieParser());app.use('/admin/community/api',createAdminRouter());const base=await serve(t,app);
 for(const [method,route] of [['GET','overview'],['GET','administrators'],['GET','groups'],['POST','groups'],['PATCH','groups/1'],['GET','groups/1/image'],['PUT','groups/1/image'],['DELETE','groups/1/image'],['GET','groups/1/invite-link'],['DELETE','groups/1/invite-link'],['PUT','groups/1/invite-link'],['GET','join-requests/1'],['POST','join-requests/1/decision'],['POST','join-requests/1/rescreen'],['GET','join-requests/1/handoff'],['POST','join-requests/1/handoff-complete'],['GET','members'],['PATCH','members/1'],['PATCH','memberships/1'],['POST','reports'],['PATCH','reports/1'],['POST','warnings'],['PATCH','warnings/1'],['POST','blocks'],['POST','blocks/1/unblock'],['POST','notes'],['GET','audit-logs'],['PATCH','settings'],['GET','members/1/export'],['POST','members/1/anonymize']]){
  const response=await fetch(base+'/admin/community/api/'+route,{method,...(method==='GET'?{}:{headers,body:'{}'})});assert.equal(response.status,401,method+' '+route);assert.equal(response.headers.get('cache-control'),'no-store');
 }
 const expiry=Date.now()+60000,mac=crypto.createHmac('sha256',process.env.SESSION_SECRET).update(String(expiry)).digest('hex'),cookie='ln_admin='+expiry+'.'+mac;
 const out=await fetch(base+'/admin/community/api/settings',{headers:{Cookie:cookie}});assert.equal(out.status,503);assert.match((await out.json()).error,/database unavailable/);
 const cross=await fetch(base+'/admin/community/api/settings',{headers:{Cookie:cookie,Origin:'https://external.example'}});assert.equal(cross.status,403);
 const write=await fetch(base+'/admin/community/api/groups',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:'{}'});assert.equal(write.status,403);
});
test('public HTTP configuration/group allowlists, existing CSRF, honeypot, consent and failures',async t=>{
 let submissions=0;const app=express();app.use(cookieParser());app.use(express.json({limit:'64kb'}));app.use('/api/community',createPublicRouter({getSettings:async()=>config,getDatabase:()=>({execute:async()=>[[{id:1,name:'Local community',status:'ACTIVE',invite_link_encrypted:'PRIVATE LINK',instructions:'PRIVATE NOTES',is_public:1}]]}),submit:async()=>{submissions++;return {message:'Your request has been received and will be reviewed.'};}}));const base=await serve(t,app);
 for(const route of ['config','groups']){const out=await fetch(base+'/api/community/'+route);assert.equal(out.status,200);assert.equal(out.headers.get('cache-control'),'no-store');assert.doesNotMatch(await out.text(),/PRIVATE|invite|instructions|screening_patterns/);}
 let out=await fetch(base+'/api/community/join-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(application)});assert.equal(out.status,403);
 out=await fetch(base+'/api/community/join-requests',{method:'POST',headers,body:JSON.stringify(application)});assert.equal(out.status,201);assert.equal(submissions,1);assert.doesNotMatch(await out.text(),/risk|block|memberId|invite/);
 for(const patch of [{rulesAccepted:false},{website:'bot.example'},{reason:'aaaaaaaaaaaaaaaaaaaa'}]){out=await fetch(base+'/api/community/join-requests',{method:'POST',headers,body:JSON.stringify({...application,...patch})});assert.equal(out.status,400);}assert.equal(submissions,1);
 const large=await fetch(base+'/api/community/join-requests',{method:'POST',headers,body:JSON.stringify({...application,extra:'x'.repeat(20000)})});assert.equal(large.status,413);
});
test('Express 4 async adaptation forwards rejected promises instead of leaving HTTP requests hanging',async t=>{const app=express(),router=compatibleRouter();router.get('/',async()=>{const e=new Error('missing');e.code='ER_NO_SUCH_TABLE';throw e;});router.use(communityErrors);app.use(router);const base=await serve(t,app);const out=await fetch(base);assert.equal(out.status,503);});
test('public EJS renders both locales and all admin screens reuse the existing navigation',async()=>{
 const site=require('../lib/site'),pages=require('../routes/pages'),sections=require('../routes/community-admin').sections;
 for(const lang of ['en','de']){const res={locals:{},render(){}};pages.context(lang)({path:'/community',cookies:{}},res,()=>{});const html=await ejs.renderFile(path.join(__dirname,'../views/pages/community.ejs'),{...res.locals,communityCsrf:token});assert.match(html,/data-community-public/);assert.equal((html.match(/<main\b/g)||[]).length,1);assert.match(html,/name="viewport"/);assert.match(html,lang==='de'?/Community beitreten/:/Join the Community/);assert.doesNotMatch(html,/iamseraj/);}
 for(const section of Object.keys(sections)){const html=await ejs.renderFile(path.join(__dirname,'../views/pages/admin-community.ejs'),{site,section,sections,communityCsrf:token,dbState:{enabled:false}});assert.match(html,/data-community-admin/);assert.match(html,new RegExp('data-section="'+section+'"'));assert.match(html,/WhatsApp Community/);assert.match(html,/\/admin\/logout/);}
});
test('migration is additive, belongs to existing runner, matches admin_users unsigned IDs, and keeps initial setup manual',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../MySQL/38_community.sql'),'utf8'),seed=fs.readFileSync(path.join(__dirname,'../MySQL/community-settings.sql'),'utf8'),migrate=require('../lib/migrate');
 assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,11);assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|ALTER|INSERT|UPDATE|DELETE)\s+(?:TABLE|INTO|FROM|community_|students)/i);assert.doesNotMatch(sql,/REFERENCES users\(/);assert.match(sql,/actor_user_id INT UNSIGNED NULL/);assert.match(seed,/INSERT IGNORE/);assert.ok(migrate.files().includes('38_community.sql'));assert.ok(!migrate.files().includes('community-settings.sql'));
});
test('service worker keeps community notice/form tokens out of runtime cache',()=>{const sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');assert.match(sw,/PRIVATE = \["\/community", "\/de\/community"/);});
