"use strict";
const express=require('express'),site=require('../lib/site'),csrf=require('../lib/csrf');
const {requireCommunityAdmin,privateResponses}=require('../lib/community/security');
const sections={'overview':'Overview','join-requests':'Join Requests','members':'Members','groups':'Groups','reports':'Reports','warnings':'Warnings','blocks':'Blocked Members','settings':'Rules & Settings','audit-logs':'Audit Log'};
function build(){
 const router=express.Router();router.use(privateResponses);
 router.use((req,res,next)=>{if(!require('./admin').isAuthed(req))return req.path.startsWith('/api')?res.status(401).json({error:'Administrator authentication required'}):res.redirect('/admin');next();});
 router.use('/api',require('../lib/community/admin-router').createAdminRouter());
 router.get(['/', '/:section'],(req,res,next)=>{
   const section=req.params.section||'overview';if(!Object.hasOwn(sections,section))return next();
   res.render('pages/admin-community',{site,section,sections,communityCsrf:csrf.token(req,res)});
 });return router;
}
module.exports={build,sections};
