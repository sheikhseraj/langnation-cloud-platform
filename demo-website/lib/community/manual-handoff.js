"use strict";
const { transaction, row, safeGroup, history, update } = require('./repository.js');
const { decryptInvite, encryptInvite } = require('./security.js');
const { audit } = require('./audit.js');
const { CommunityError, normalizePhone, inviteLink: validateInvite } = require('./validation.js');
const { refreshMemberStatus } = require('./moderation.js');

function approvalMessage(fullName, groupName, inviteLink) {
  const firstName=String(fullName||'').trim().split(/\s+/u)[0]||'there';
  const invitation=inviteLink
    ? `You can join the group using the link below:\n\n${inviteLink}\n\nPlease follow the community rules and do not share the invitation link with unknown people.`
    : 'I will add you to the WhatsApp group manually.\n\nPlease follow the community rules once you join.';
  return `Hi ${firstName},\n\nyour request to join ${groupName} has been approved.\n\n${invitation}\n\nWelcome to the community!\nLangNation Team`;
}
function clickToChat(phone, message) {
  try { return 'https://wa.me/'+normalizePhone(phone).slice(1)+'?text='+encodeURIComponent(message); }
  catch { return null; }
}

async function setInvite(groupId, body, actor, pool) {
  const value = validateInvite(body.inviteLink)
  if(!value)throw new CommunityError(400,'Enter a new invite link. Use the separate Remove invite action to remove it.');
  const encrypted = encryptInvite(value)
  return transaction(async connection => {
    await row(connection, 'groups', groupId, true)
    await update(connection, 'groups', groupId, { invite_link_encrypted: encrypted })
    await audit(connection, actor, 'GROUP_INVITE_CHANGED', 'GROUP', groupId)
    return { id: groupId, hasInviteLink: true }
  }, pool)
}
async function getPrivateInvite(groupId, actor, pool) {
  return transaction(async connection=>{
    const group=await row(connection,'groups',groupId);
    const link=decryptInvite(group.invite_link_encrypted);
    if(link)await audit(connection,actor,'GROUP_INVITE_VIEWED','GROUP',groupId);
    return {hasInviteLink:Boolean(link),inviteLink:link};
  },pool);
}
async function removeInvite(groupId, body, actor, pool) {
  if(body?.confirm!==true)throw new CommunityError(400,'Confirm removal of the private invite link explicitly');
  return transaction(async connection=>{
    await row(connection,'groups',groupId,true);
    await update(connection,'groups',groupId,{invite_link_encrypted:null});
    await audit(connection,actor,'GROUP_INVITE_REMOVED','GROUP',groupId);
    return {id:groupId,hasInviteLink:false};
  },pool);
}
async function handoff(requestId, actor, pool) {
  return transaction(async connection => {
    const request = await row(connection, 'join-requests', requestId, true)
    if (request.status !== 'APPROVED') throw new CommunityError(409, 'Request must be approved before handoff')
    const member = await row(connection, 'members', request.member_id, true)
    if (member.anonymized_at || (await history(connection, member.id)).blocked) throw new CommunityError(409, 'Applicant cannot receive a handoff')
    const group = await row(connection, 'groups', request.group_id)
    if (group.status !== 'ACTIVE') throw new CommunityError(409, 'Group is inactive')
    const methods=require('./handoff-method'),selectedMethod=methods.handoffMethod(group);
    if(selectedMethod==='STANDARD'&&!group.invite_link_encrypted)throw new CommunityError(409,'Standard handoff requires a configured private invite. Add the invite or select Manual handoff in Edit Group.');
    await audit(connection, actor, 'HANDOFF_VIEWED', 'JOIN_REQUEST', request.id)
    const inviteLink=selectedMethod==='MANUAL'?null:decryptInvite(group.invite_link_encrypted), message=approvalMessage(request.full_name,group.name,inviteLink);
    return { approvalMessage:message,whatsappUrl:clickToChat(request.normalized_phone,message),mode: selectedMethod, group: safeGroup(group), phone: request.normalized_phone, fullName: request.full_name,
      inviteLink, instructions: methods.handoffInstructions(group),
      whatsappMembershipVerified: request.handoff_status === 'COMPLETED' }
  }, pool)
}
async function completeHandoff(requestId, actor, pool) {
  return transaction(async connection => {
    const request = await row(connection, 'join-requests', requestId, true)
    if (request.status !== 'APPROVED' || request.handoff_status !== 'PENDING') throw new CommunityError(409, 'No pending approved handoff')
    const member = await row(connection, 'members', request.member_id, true)
    if (member.anonymized_at || (await history(connection, member.id)).blocked) throw new CommunityError(409, 'Applicant cannot be admitted')
    const group = await row(connection, 'groups', request.group_id)
    if (group.status !== 'ACTIVE') throw new CommunityError(409, 'Group is inactive')
    const [membershipUpdate] = await connection.execute("UPDATE community_memberships SET status = 'ACTIVE', joined_at = COALESCE(joined_at, NOW()), ended_at = NULL, verified_by_user_id = ?, verified_at = NOW() WHERE member_id = ? AND group_id = ?", [actor.userId, member.id, group.id])
    if (membershipUpdate.affectedRows !== 1) throw new CommunityError(409, 'Approved membership record is missing')
    await update(connection, 'join-requests', request.id, { handoff_status: 'COMPLETED', handoff_completed_at: new Date() })
    await refreshMemberStatus(connection, member.id)
    await audit(connection, actor, 'HANDOFF_COMPLETED', 'JOIN_REQUEST', request.id, { memberId: member.id, groupId: group.id })
    await audit(connection, actor, 'MEMBERSHIP_STATUS_CHANGED', 'MEMBER', member.id, { status: 'ACTIVE', groupId: group.id })
    return { id: request.id, handoffStatus: 'COMPLETED' }
  }, pool)
}

module.exports = { setInvite, getPrivateInvite, removeInvite, handoff, completeHandoff, approvalMessage, clickToChat };
