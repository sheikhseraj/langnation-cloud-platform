"use strict";
const db = require('../db');
const { CommunityError, pagination, id, text, choice } = require('./validation.js');

const TABLES = Object.freeze({ groups: 'community_groups', members: 'community_members', memberships: 'community_memberships',
  'join-requests': 'community_join_requests', reports: 'community_reports', warnings: 'community_warnings', blocks: 'community_blocks', notes: 'community_admin_notes', 'audit-logs': 'community_audit_logs' })
const JSON_FIELDS = ['reasons', 'signals', 'metadata', 'notification_preferences', 'warning_policy', 'screening_patterns']
function decode(row) {
  if (!row) return row
  const result = { ...row }
  for (const key of JSON_FIELDS) if (typeof result[key] === 'string') result[key] = JSON.parse(result[key])
  return result
}
const adapter = service => ({ execute: async (sql, params = []) => [await service.query(sql, params)] });
function database() {
  if (!db.isEnabled()) throw new CommunityError(503, 'Community database unavailable');
  return { ...adapter(db), runTransaction: work => db.transaction(connection => work(adapter(connection))) };
}
async function transaction(work, pool = database()) {
  for (let attempt = 0; ; attempt++) {
    try {
      if (pool.runTransaction) return await pool.runTransaction(work);
      // An injected driver fixture lets workflow tests run without MySQL.
      const connection = await pool.getConnection();
      try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } catch (error) { if (error.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error; }
  }
}
async function settings(connection = database(), lock = false) {
  const [rows] = await connection.execute(`SELECT * FROM community_settings WHERE id = 1${lock ? ' FOR UPDATE' : ''}`)
  if (!rows.length) throw new CommunityError(503, 'Community migration has not been configured')
  return decode(rows[0])
}
async function row(connection, resource, recordId, lock = false) {
  if (!TABLES[resource]) throw new CommunityError(404, 'Unknown resource')
  const [rows] = await connection.execute(`SELECT * FROM ${TABLES[resource]} WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id(recordId)])
  if (!rows.length) throw new CommunityError(404, 'Record not found')
  return decode(rows[0])
}
async function insert(connection, resource, data) {
  const fields = Object.keys(data)
  const [result] = await connection.execute(`INSERT INTO ${TABLES[resource]} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, Object.values(data))
  return result.insertId
}
async function update(connection, resource, recordId, data) {
  const fields = Object.keys(data)
  if (!fields.length) throw new CommunityError(400, 'No changes provided')
  await connection.execute(`UPDATE ${TABLES[resource]} SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`, [...Object.values(data), recordId])
}
function safeGroup(group) {
  const { invite_link_encrypted, image, image_type, ...safe } = group
  return { ...safe, handoff_method: require('./handoff-method').handoffMethod(group), has_invite_link: Boolean(invite_link_encrypted), has_image: Boolean(group.image_updated_at) }
}
function publicGroup(group) {
  return { id: group.id, name: group.name, slug: group.slug, city: group.city, description: group.description,
    coverImageUrl: require('./group-cover').coverImageUrl(group), status: group.status, acceptingApplications: Boolean(group.accepting_applications), memberCount: group.current_member_count ?? null, communityName: group.community_name || null, initials: require('../avatar').initials(group.name), imageUrl: group.image_updated_at ? '/api/community/groups/'+group.id+'/image?v='+new Date(group.image_updated_at).getTime() : null }
}
function maskPhone(phone) { return phone ? `${phone.slice(0, 3)}${'*'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}` : null }
const STATUSES = {
  groups: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], members: ['PENDING', 'ACTIVE', 'WARNED', 'BLOCKED', 'LEFT', 'REMOVED', 'ANONYMIZED'],
  memberships: ['PENDING', 'ACTIVE', 'WARNED', 'BLOCKED', 'LEFT', 'REMOVED'], 'join-requests': ['PENDING', 'REVIEW', 'APPROVED', 'REJECTED'],
  reports: ['OPEN', 'REVIEW', 'RESOLVED', 'DISMISSED'], warnings: ['ACTIVE', 'REVOKED']
}
async function list(resource, query, connection = database()) {
  const table = TABLES[resource]
  if (!table) throw new CommunityError(404, 'Unknown resource')
  const { page, limit } = pagination(query), where = [], params = []
  if (query.status && STATUSES[resource]) { where.push('t.status = ?'); params.push(choice(query.status, STATUSES[resource], 'status')) }
  const groupColumn = resource === 'blocks' ? 'originating_group_id' : 'group_id'
  if (query.groupId && !['groups', 'members', 'audit-logs'].includes(resource)) { where.push(`t.${groupColumn} = ?`); params.push(id(query.groupId)) }
  if (query.memberId && ['memberships', 'join-requests', 'warnings', 'blocks', 'notes', 'reports'].includes(resource)) {
    where.push(`t.${resource === 'reports' ? 'reported_member_id' : 'member_id'} = ?`); params.push(id(query.memberId))
  }
  if (query.city && ['groups', 'members', 'join-requests'].includes(resource)) { where.push('t.city = ?'); params.push(text(query.city, 'City', 120)) }
  if (query.search && ['groups', 'members', 'join-requests'].includes(resource)) {
    where.push(`t.${resource === 'groups' ? 'name' : 'full_name'} LIKE ?`); params.push(`%${text(query.search, 'Search', 160)}%`)
  }
  for (const [key, operator] of [['from', '>='], ['to', '<']]) if (query[key]) {
    const date = text(query[key], key, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new CommunityError(400, 'Invalid date filter')
    where.push(`t.created_at ${operator} ${key === 'to' ? 'DATE_ADD(?, INTERVAL 1 DAY)' : '?'}`); params.push(date)
  }
  let join = '', projection = resource === 'groups' ? 't.id, t.name, t.slug, t.city, t.description, t.platform, t.status, t.is_public, t.accepting_applications, t.approximate_capacity, t.current_member_count, t.invite_link_encrypted, t.instructions, t.invite_delivery_mode, t.custom_rules, t.custom_rules_version, t.community_name, t.image_updated_at, t.created_at, t.updated_at' : 't.*'
  if (['blocks', 'warnings', 'reports', 'memberships'].includes(resource)) {
    join = ` LEFT JOIN community_members m ON m.id = t.${resource === 'reports' ? 'reported_member_id' : 'member_id'}`
    projection += ', m.full_name AS member_name, m.normalized_phone AS member_phone'
  }
  if (resource === 'join-requests') {
    join = ' LEFT JOIN community_screening_results s ON s.id = (SELECT MAX(s2.id) FROM community_screening_results s2 WHERE s2.join_request_id = t.id)'
    projection += ', s.risk_score, s.recommendation'
    if (query.recommendation) { where.push('s.recommendation = ?'); params.push(choice(query.recommendation, ['APPROVE', 'REVIEW', 'REJECT'], 'recommendation')) }
    if (query.risk) {
      const config = await settings(connection)
      choice(query.risk, ['LOW', 'REVIEW', 'HIGH'], 'risk')
      if (query.risk === 'LOW') { where.push('s.risk_score <= ?'); params.push(config.low_risk_threshold) }
      if (query.risk === 'REVIEW') { where.push('s.risk_score > ? AND s.risk_score <= ?'); params.push(config.low_risk_threshold, config.high_risk_threshold) }
      if (query.risk === 'HIGH') { where.push('s.risk_score > ?'); params.push(config.high_risk_threshold) }
    }
  }
  if (resource === 'blocks' && query.active !== 'false') where.push('t.unblocked_at IS NULL')
  if (resource === 'audit-logs' && query.targetId) { where.push('t.target_id = ?'); params.push(id(query.targetId)) }
  if (resource === 'audit-logs' && query.targetType) { where.push('t.target_type = ?'); params.push(text(query.targetType, 'Target type', 32)) }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const [[count]] = await connection.execute(`SELECT COUNT(*) AS total FROM ${table} t${join}${clause}`, params)
  // Pagination is validated as bounded integers before interpolating.
  const [rows] = await connection.execute(`SELECT ${projection} FROM ${table} t${join}${clause} ORDER BY t.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params)
  const items = rows.map(decode).map(item => {
    if ('member_phone' in item) item.member_phone = maskPhone(item.member_phone)
    if (resource === 'groups') return safeGroup(item)
    if (resource === 'members' || resource === 'join-requests') return { ...item, normalized_phone: maskPhone(item.normalized_phone), ...(resource === 'members' ? { display_phone: maskPhone(item.display_phone) } : {}) }
    return item
  })
  return { items, total: Number(count.total), page, limit }
}
async function history(connection, memberId) {
  const [[request]] = await connection.execute("SELECT COUNT(*) AS total, SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS recent, SUM(status = 'REJECTED') AS rejected FROM community_join_requests WHERE member_id = ?", [memberId])
  const [[block]] = await connection.execute('SELECT COUNT(*) AS total FROM community_blocks WHERE member_id = ? AND unblocked_at IS NULL', [memberId])
  const [[warnings]] = await connection.execute("SELECT COUNT(*) AS total FROM community_warnings w JOIN community_reports r ON r.id = w.report_id WHERE w.member_id = ? AND w.status = 'ACTIVE' AND r.category IN ('ADVERTISEMENT', 'REPEATED_PROMOTION', 'SPAM')", [memberId])
  return { existingMember: Number(request.total) > 0, recentRequests: Number(request.recent), previouslyRejected: Number(request.rejected) > 0, blocked: Number(block.total) > 0, spamWarnings: Number(warnings.total) }
}

module.exports = { TABLES, decode, database, transaction, settings, row, insert, update, safeGroup, publicGroup, maskPhone, list, history };
