"use strict";
const { transaction, row, decode } = require('./repository.js');
const { audit } = require('./audit.js');
const { CommunityError } = require('./validation.js');

async function exportMember(memberId, actor) {
  return transaction(async connection => {
    const member = await row(connection, 'members', memberId, true), result = { member }
    const queries = {
      memberships: 'SELECT * FROM community_memberships WHERE member_id = ?',
      requests: 'SELECT * FROM community_join_requests WHERE member_id = ?',
      screening: 'SELECT s.* FROM community_screening_results s JOIN community_join_requests r ON r.id = s.join_request_id WHERE r.member_id = ?',
      reports: 'SELECT * FROM community_reports WHERE reported_member_id = ? OR reporter_member_id = ?',
      warnings: 'SELECT * FROM community_warnings WHERE member_id = ?', blocks: 'SELECT * FROM community_blocks WHERE member_id = ?',
      notes: 'SELECT n.* FROM community_admin_notes n LEFT JOIN community_join_requests r ON r.id = n.join_request_id LEFT JOIN community_reports p ON p.id = n.report_id WHERE n.member_id = ? OR r.member_id = ? OR p.reported_member_id = ? OR p.reporter_member_id = ?'
    }
    for (const [key, sql] of Object.entries(queries)) {
      const [rows] = await connection.execute(sql, Array(sql.split('?').length - 1).fill(memberId)); result[key] = rows.map(decode)
    }
    await audit(connection, actor, 'MEMBER_EXPORTED', 'MEMBER', memberId)
    // Admin-only review export; redact third-party report data before fulfilling a subject-access request.
    return result
  })
}
async function anonymizeMember(memberId, actor, pool) {
  return transaction(async connection => {
    const member = await row(connection, 'members', memberId, true)
    if (member.anonymized_at) throw new CommunityError(409, 'Member already anonymized')
    const [[block]] = await connection.execute('SELECT COUNT(*) AS total FROM community_blocks WHERE member_id = ? AND unblocked_at IS NULL', [memberId])
    if (Number(block.total)) throw new CommunityError(409, 'Resolve active blocks and moderation retention before anonymizing; phone matching will no longer be possible')
    await connection.execute("UPDATE community_members SET full_name = NULL, normalized_phone = NULL, display_phone = NULL, city = NULL, status = 'ANONYMIZED', first_joined_at = NULL, last_activity_at = NULL, anonymized_at = NOW() WHERE id = ?", [memberId])
    await connection.execute("UPDATE community_join_requests SET full_name = NULL, normalized_phone = NULL, city = NULL, reason = NULL, referral_source = NULL, decision_reason = NULL, status = IF(status IN ('PENDING','REVIEW'), 'REJECTED', status), handoff_status = 'NOT_READY' WHERE member_id = ?", [memberId])
    await connection.execute("UPDATE community_screening_results s JOIN community_join_requests r ON r.id = s.join_request_id SET s.reasons = '[]', s.signals = '[]' WHERE r.member_id = ?", [memberId])
    await connection.execute('UPDATE community_reports SET reporter_contact = NULL, description = NULL, quoted_text = NULL, resolution = NULL WHERE reported_member_id = ? OR reporter_member_id = ?', [memberId, memberId])
    await connection.execute('UPDATE community_warnings SET reason = NULL WHERE member_id = ?', [memberId])
    await connection.execute('UPDATE community_blocks SET reason = NULL WHERE member_id = ?', [memberId])
    await connection.execute('UPDATE community_admin_notes n LEFT JOIN community_join_requests r ON r.id = n.join_request_id LEFT JOIN community_reports p ON p.id = n.report_id SET n.body = NULL WHERE n.member_id = ? OR r.member_id = ? OR p.reported_member_id = ? OR p.reporter_member_id = ?', [memberId, memberId, memberId, memberId])
    await connection.execute("UPDATE community_memberships SET status = 'REMOVED', joined_at = NULL, ended_at = NOW(), verified_at = NULL WHERE member_id = ?", [memberId])
    await audit(connection, actor, 'MEMBER_ANONYMIZED', 'MEMBER', memberId, { status: 'ANONYMIZED' })
    return { id: memberId, anonymized: true }
  }, pool)
}

module.exports = { exportMember, anonymizeMember };
