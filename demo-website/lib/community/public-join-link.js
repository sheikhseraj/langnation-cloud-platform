'use strict';
const {database,settings}=require('./repository');
async function publicJoinGroup(slug,{getDatabase=database,getSettings=settings}={}){
 if(typeof slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160)return null;
 const [rows]=await getDatabase().execute("SELECT id, name, slug, accepting_applications FROM community_groups WHERE slug = ? AND status = 'ACTIVE' AND is_public = TRUE LIMIT 1",[slug]);
 if(!rows.length)return null;const group=rows[0],config=await getSettings();
 return {id:group.id,name:group.name,slug:group.slug,available:Boolean(config.feature_enabled&&config.applications_enabled&&config.privacy_text?.trim()&&group.accepting_applications)};
}
function joinPageHandler({lang='en',countries=[],lookup=publicJoinGroup}={}){
 return async(req,res,next)=>{try{const target=await lookup(req.params.slug);if(!target)return next();res.set('Cache-Control','no-store');res.locals.seo={...res.locals.seo,title:(lang==='de'?'Community beitreten':'Join the Community')+' | LangNation'};res.render('pages/community',{countries,communityJoinTarget:target,communityCsrf:require('../csrf').token(req,res)});}catch(error){next(error);}};
}
module.exports={publicJoinGroup,joinPageHandler};
