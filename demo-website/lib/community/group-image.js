'use strict';
const avatar=require('../avatar');
const {transaction,row,database}=require('./repository');
const {id,CommunityError}=require('./validation');
const {audit}=require('./audit');
async function saveImage(groupId,body,actor,pool){
 const image=avatar.fromDataUrl(body?.imageDataUrl);
 if(!image.ok)throw new CommunityError(400,image.reason);
 return transaction(async connection=>{
  await row(connection,'groups',groupId,true);
  await connection.execute('UPDATE community_groups SET image = ?, image_type = ?, image_updated_at = NOW() WHERE id = ?',[image.buffer,image.type,groupId]);
  await audit(connection,actor,'GROUP_IMAGE_CHANGED','GROUP',groupId);
  return {id:groupId};
 },pool);
}
async function removeImage(groupId,body,actor,pool){
 if(body?.confirm!==true)throw new CommunityError(400,'Confirm image removal');
 return transaction(async connection=>{
  await row(connection,'groups',groupId,true);
  await connection.execute('UPDATE community_groups SET image = NULL, image_type = NULL, image_updated_at = NULL WHERE id = ?',[groupId]);
  await audit(connection,actor,'GROUP_IMAGE_REMOVED','GROUP',groupId);return {id:groupId};
 },pool);
}
async function readImage(groupId,publicOnly=false,connection=database()){
 const [rows]=await connection.execute('SELECT image, image_type FROM community_groups WHERE id = ?'+(publicOnly?" AND status = 'ACTIVE' AND is_public = TRUE":''),[id(groupId)]);
 const item=rows[0];
 if(!item?.image||!avatar.bytesMatchType(item.image,item.image_type))throw new CommunityError(404,'Group image not found');
 return {buffer:item.image,type:item.image_type};
}
module.exports={saveImage,removeImage,readImage};
