'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {saveImage,removeImage,readImage}=require('../lib/community/group-image');
const {publicGroup,safeGroup}=require('../lib/community/repository');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUO0AAAAASUVORK5CYII=','base64'),actor={userId:null,kind:'SHARED_ADMIN'};
function fixture(){const group={id:1,name:'Community Group',status:'ACTIVE',is_public:true,image:null,image_type:null,image_updated_at:null,community_name:'Parent Community',current_member_count:47},events=[];const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,params=[])=>{
 if(sql.startsWith('SELECT * FROM community_groups'))return [[group]];
 if(sql.startsWith('SELECT image'))return [[...(sql.includes('is_public = TRUE')&&(!group.is_public||group.status!=='ACTIVE')?[]:[group])]];
 if(sql.startsWith('UPDATE community_groups SET image = NULL')){group.image=null;group.image_type=null;group.image_updated_at=null;}
 else if(sql.startsWith('UPDATE community_groups SET image = ?')){group.image=params[0];group.image_type=params[1];group.image_updated_at=new Date();}
 if(sql.startsWith('INSERT INTO community_audit_logs'))events.push(JSON.parse(params[5]));return [{insertId:1}];
 }};return {group,events,conn,pool:{getConnection:async()=>conn}};}
test('group logo uploads reuse existing raster validation/storage and expose only display metadata',async()=>{
 const f=fixture();await saveImage(1,{imageDataUrl:'data:image/png;base64,'+image.toString('base64')},actor,f.pool);assert.deepEqual((await readImage(1,true,f.conn)).buffer,image);const pub=publicGroup(f.group),admin=safeGroup(f.group);assert.equal(pub.memberCount,47);assert.equal(pub.communityName,'Parent Community');assert.match(pub.imageUrl,/^\/api\/community\/groups\/1\/image/);assert.ok(!('image' in pub));assert.ok(!('image' in admin));assert.ok(!JSON.stringify(f.events).includes('base64'));assert.equal(admin.has_image,true);
});
test('private/inactive logos cannot be retrieved publicly; bad formats and unconfirmed deletion fail',async()=>{
 const f=fixture();for(const imageDataUrl of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PGh0bWw+','data:image/png;base64,'+'A'.repeat(600000)])await assert.rejects(saveImage(1,{imageDataUrl},actor,f.pool),e=>e.status===400);
 await saveImage(1,{imageDataUrl:'data:image/png;base64,'+image.toString('base64')},actor,f.pool);f.group.is_public=false;await assert.rejects(readImage(1,true,f.conn),e=>e.status===404);assert.deepEqual((await readImage(1,false,f.conn)).buffer,image);await assert.rejects(removeImage(1,{},actor,f.pool),e=>e.status===400);await removeImage(1,{confirm:true},actor,f.pool);assert.equal(f.group.image,null);
});
