'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {coverImageUrl}=require('../lib/community/group-cover'),{publicGroup}=require('../lib/community/repository');
test('static covers resolve city and custom priority independently of the uploaded circular logo',()=>{
 for(const city of ['Berlin',' Magdeburg ','ERLANGEN'])assert.equal(coverImageUrl({city}),'/img/community/covers/cities/'+city.trim().toLowerCase()+'.webp');
 const present=file=>file.replace(/\\/g,'/').endsWith('/groups/my-group.png')||file.replace(/\\/g,'/').endsWith('/cities/berlin.webp');assert.equal(coverImageUrl({city:'Berlin',slug:'my-group'},present),'/img/community/covers/groups/my-group.png');
 assert.equal(coverImageUrl({city:'Unknown city'}),'/img/community/covers/default.webp');assert.equal(coverImageUrl({city:'München'},p=>p.replace(/\\/g,'/').endsWith('/cities/munchen.jpg')),'/img/community/covers/cities/munchen.jpg');
 const g=publicGroup({id:9,name:'Existing logo group',city:'Berlin',slug:'my-group',image_updated_at:'2026-10-07T00:00:00Z'});assert.match(g.imageUrl,/^\/api\/community\/groups\/9\/image/);assert.equal(g.coverImageUrl,'/img/community/covers/cities/berlin.webp');assert.ok(!coverImageUrl({city:'../../secret',slug:'../secret'},()=>false).includes('secret'));
});
test('cover markup retains original avatar/layout, fixed cover sizing, and scoped WhatsApp badge correction',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../public/css/site.css'),'utf8');assert.match(js,/const avatar=groupAvatar\(g\)/);assert.match(js,/g.coverImageUrl/);assert.ok(!js.includes("const source=avatar.querySelector('img')"));assert.match(css,/\.cm-group-cover\{height:170px/);assert.match(css,/\.cm-group-cover>img\{width:100%;height:100%;object-fit:cover/);assert.match(css,/\.cm-public-profile>\.cm-wa-icon:before\{mask-image/);
});
