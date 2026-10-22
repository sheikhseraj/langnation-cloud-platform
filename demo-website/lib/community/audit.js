"use strict";
const SAFE_KEYS = new Set(['status', 'previousStatus', 'recommendation', 'riskScore', 'screeningVersion', 'level', 'overridden', 'fields', 'groupId', 'memberId', 'reasonProvided'])
async function audit(connection, actor, action, targetType, targetId, metadata = {}) {
  const safe = Object.fromEntries(Object.entries(metadata).filter(([key]) => SAFE_KEYS.has(key)))
  await connection.execute('INSERT INTO community_audit_logs (actor_user_id, actor_kind, action, target_type, target_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    [actor?.userId ?? null, actor?.kind ?? 'APPLICANT', action, targetType, targetId, JSON.stringify(safe)])
}

module.exports = { audit };
