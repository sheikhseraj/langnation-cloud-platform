'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),{once}=require('node:events'),fs=require('node:fs'),path=require('node:path');
const {publicJoinGroup,joinPageHandler}=require('../lib/community/public-join-link');
const config={feature_enabled:true,applications_enabled:true,privacy_text:'Notice'};
function dependencies(group,patch={}){return {getDatabase:()=>({execute:async(sql,params)=>{assert.match(sql,/slug = \? AND status = 'ACTIVE' AND is_public = TRUE/);assert.equal(params.length,1);return [[group&&group.slug===params[0]&&group.status==='ACTIVE'&&group.is_public?group:null].filter(Boolean)];}}),getSettings:async()=>({...config,...patch})};}
const group={id:3,name:'Indians in Magdeburg',slug:'indians-in-magdeburg',status:'ACTIVE',is_public:true,accepting_applications:true,invite_link_encrypted:'PRIVATE',instructions:'SECRET',risk_score:99};
test('slug lookup exposes only target metadata and honors group/global availability',async()=>{
 const result=await publicJoinGroup(group.slug,dependencies(group));assert.deepEqual(result,{id:3,name:group.name,slug:group.slug,available:true});assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET|risk|invite/);
 for(const patch of [{accepting_applications:false}])assert.equal((await publicJoinGroup(group.slug,dependencies({...group,...patch}))).available,false);
 for(const patch of [{applications_enabled:false},{feature_enabled:false}])assert.equal((await publicJoinGroup(group.slug,dependencies(group,patch))).available,false);
 for(const target of [null,{...group,status:'INACTIVE'},{...group,is_public:false}])assert.equal(await publicJoinGroup(group.slug,dependencies(target)),null);
 assert.equal(await publicJoinGroup('unknown-slug',dependencies(group)),null);assert.equal(await publicJoinGroup("x' OR 1=1",dependencies(group)),null);
});
test('join page reuses community rendering, returns normal 404 for missing/private/inactive and forwards errors',async t=>{
 const app=express();app.get('/community/join/:slug',(req,res,next)=>{res.render=(view,data)=>res.json({view,target:data.communityJoinTarget});next();},joinPageHandler({lookup:slug=>publicJoinGroup(slug,dependencies(group))}));app.use((_req,res)=>res.status(404).send('Normal not found'));const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();server.closeAllConnections();});const base='http://127.0.0.1:'+server.address().port;
 const valid=await fetch(base+'/community/join/'+group.slug);assert.equal(valid.status,200);assert.match(valid.headers.get('cache-control'),/no-store/);assert.deepEqual(await valid.json(),{view:'pages/community',target:{id:3,name:group.name,slug:group.slug,available:true}});
 for(const route of ['/community/join/unknown','/community/join/'])assert.equal((await fetch(base+route)).status,404);
 let forwarded;await joinPageHandler({lookup:async()=>{throw Error('db down');}})({params:{slug:'valid'}},{},error=>{forwarded=error;});assert.equal(forwarded.message,'db down');
});
test('admin copy/open actions use canonical public origin and existing shared clipboard attributes',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8'),view=fs.readFileSync(path.join(__dirname,'../views/pages/admin-community.ejs'),'utf8');assert.match(view,/data-public-origin="<%= site.origin %>"/);assert.match(js,/function publicJoinUrl/);assert.match(js,/encodeURIComponent\(group.slug\)/);assert.match(js,/copyJoin.setAttribute\('data-copy',joinLink\)/);assert.match(js,/Open public page/);assert.match(js,/card\('Public Join Link'/);
});
