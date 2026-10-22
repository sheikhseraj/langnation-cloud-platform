"use strict";
const { transaction, settings, row, insert, update, history, database, decode } = require('./repository.js');
const { audit } = require('./audit.js');
const { CommunityScreeningService } = require('./screening.js');
const { CommunityError, choice, text } = require('./validation.js');

const screening = new CommunityScreeningService()
async function saveAssessment(connection, request, config) {
  const result = screening.assess(request, await history(connection, request.member_id), config)
  await connection.execute('INSERT INTO community_screening_results (join_request_id, risk_score, recommendation, reasons, signals, screening_version, screened_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [request.id, result.riskScore, result.recommendation, JSON.stringify(result.reasons), JSON.stringify(result.signals), result.screeningVersion, result.screenedAt])
  await audit(connection, null, 'SCREENING_COMPLETED', 'JOIN_REQUEST', request.id, { recommendation: result.recommendation, riskScore: result.riskScore, screeningVersion: result.screeningVersion })
  return result
}
async function submitApplication(application, pool) {
  return transaction(async connection => {
    const config = await settings(connection, true)
    if (!config.feature_enabled || !config.applications_enabled || !config.privacy_text.trim()) throw new CommunityError(503, 'Community applications are currently unavailable')
    const group = await row(connection, 'groups', application.group_id, true)
    const acceptedRules = require('./policy').effectiveRules(group, config)
    if (application.rules_version !== acceptedRules.rulesVersion || application.privacy_version !== config.privacy_version) throw new CommunityError(409, 'Community rules or privacy notice changed. Please reload and acknowledge the current versions.')
    if (group.status !== 'ACTIVE' || !group.is_public || !group.accepting_applications) throw new CommunityError(400, 'This group is not accepting public applications')
    // Unique phone constraint serializes concurrent duplicate applicant creation.
    const [memberInsert] = await connection.execute('INSERT INTO community_members (full_name, normalized_phone, display_phone, city) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [application.full_name, application.normalized_phone, application.normalized_phone, application.city])
    const memberId = memberInsert.insertId
    const member = await row(connection, 'members', memberId, true)
    if (member.anonymized_at) throw new CommunityError(409, 'Please contact the community administrator')
    const [previous] = await connection.execute('SELECT id FROM community_join_requests WHERE member_id = ? AND group_id = ? ORDER BY id DESC LIMIT 1', [memberId, application.group_id])
    const now = new Date()
    const requestId = await insert(connection, 'join-requests', { ...application, member_id: memberId, rules_accepted_at: now,
      privacy_accepted_at: now, rules_text_snapshot: acceptedRules.rules, privacy_text_snapshot: config.privacy_text, duplicate_of_request_id: previous[0]?.id ?? null })
    await audit(connection, null, 'JOIN_REQUEST_CREATED', 'JOIN_REQUEST', requestId, { groupId: application.group_id, memberId })
    await saveAssessment(connection, { ...application, id: requestId, member_id: memberId }, config)
    // Never return block history, recommendations, private group data or member identifiers.
    return { message: 'Your request has been received and will be reviewed.' }
  }, pool)
}
async function decide(requestId, body, actor, pool) {
  const status = choice(body.status, ['APPROVED', 'REJECTED', 'REVIEW'], 'decision')
  const reason = text(body.reason, 'Decision reason', 2000, { optional: true })
  return transaction(async connection => {
    const request = await row(connection, 'join-requests', requestId, true)
    if (!['PENDING', 'REVIEW'].includes(request.status)) throw new CommunityError(409, 'This request already has a final decision')
    const member = await row(connection, 'members', request.member_id, true)
    if (member.anonymized_at) throw new CommunityError(409, 'Applicant data has been anonymized')
    const group = await row(connection, 'groups', request.group_id)
    const prior = await history(connection, request.member_id)
    if (status === 'APPROVED' && group.status !== 'ACTIVE') throw new CommunityError(409, 'Cannot approve an inactive group')
    if (status === 'APPROVED' && prior.blocked) throw new CommunityError(409, 'Resolve the active block before approving this request')
    const [results] = await connection.execute('SELECT recommendation FROM community_screening_results WHERE join_request_id = ? ORDER BY id DESC LIMIT 1', [request.id])
    const overridden = Boolean(results.length && results[0].recommendation !== ({ APPROVED: 'APPROVE', REJECTED: 'REJECT', REVIEW: 'REVIEW' })[status])
    await update(connection, 'join-requests', request.id, { status, decided_by_user_id: actor.userId, decision_actor_kind: actor.kind,
      decision_reason: reason, decided_at: new Date(), handoff_status: status === 'APPROVED' ? 'PENDING' : 'NOT_READY' })
    if (status === 'APPROVED') await connection.execute("INSERT INTO community_memberships (member_id, group_id, status, approved_at) VALUES (?, ?, 'PENDING', NOW()) ON DUPLICATE KEY UPDATE status = IF(status = 'ACTIVE', status, 'PENDING'), approved_at = NOW()", [request.member_id, request.group_id])
    await audit(connection, actor, 'JOIN_REQUEST_DECIDED', 'JOIN_REQUEST', request.id, { status, previousStatus: request.status, overridden, reasonProvided: Boolean(reason) })
    if (overridden) await audit(connection, actor, 'SCREENING_OVERRIDDEN', 'JOIN_REQUEST', request.id, { status, reasonProvided: Boolean(reason) })
    return { id: request.id, status, handoffStatus: status === 'APPROVED' ? 'PENDING' : 'NOT_READY' }
  }, pool)
}
async function rescreen(requestId, actor) {
  return transaction(async connection => {
    const request = await row(connection, 'join-requests', requestId, true)
    if (!['PENDING', 'REVIEW'].includes(request.status)) throw new CommunityError(409, 'Only undecided requests can be screened')
    await row(connection, 'members', request.member_id, true)
    const result = await saveAssessment(connection, request, await settings(connection))
    await audit(connection, actor, 'JOIN_REQUEST_RESCREENED', 'JOIN_REQUEST', request.id)
    return result
  })
}
async function requestDetails(requestId) {
  const connection = database(), request = await row(connection, 'join-requests', requestId)
  const [assessments] = await connection.execute('SELECT * FROM community_screening_results WHERE join_request_id = ? ORDER BY id DESC', [request.id])
  const [requests] = await connection.execute('SELECT id, group_id, status, created_at FROM community_join_requests WHERE member_id = ? ORDER BY id DESC', [request.member_id])
  const [memberships] = await connection.execute('SELECT * FROM community_memberships WHERE member_id = ?', [request.member_id])
  const [warnings] = await connection.execute('SELECT * FROM community_warnings WHERE member_id = ? ORDER BY id DESC', [request.member_id])
  const [reports] = await connection.execute('SELECT * FROM community_reports WHERE reported_member_id = ? ORDER BY id DESC', [request.member_id])
  const [blocks] = await connection.execute('SELECT * FROM community_blocks WHERE member_id = ? ORDER BY id DESC', [request.member_id])
  const [notes] = await connection.execute('SELECT * FROM community_admin_notes WHERE join_request_id = ? OR member_id = ? ORDER BY id DESC', [request.id, request.member_id])
  const [events] = await connection.execute("SELECT * FROM community_audit_logs WHERE (target_type = 'JOIN_REQUEST' AND target_id = ?) OR (target_type = 'MEMBER' AND target_id = ?) ORDER BY id DESC", [request.id, request.member_id])
  return { ...request, assessments: assessments.map(decode), requests, memberships, warnings, reports, blocks, notes, audit: events.map(decode) }
}

module.exports = { saveAssessment, submitApplication, decide, rescreen, requestDetails };
