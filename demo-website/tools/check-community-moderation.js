const test=require('node:test');
const assert=require('node:assert/strict');
const { submitApplication, decide }=require('../lib/community/applications.js');
const { completeHandoff }=require('../lib/community/manual-handoff.js');
const { transaction }=require('../lib/community/repository.js');
const { audit }=require('../lib/community/audit.js');
const { anonymizeMember }=require('../lib/community/privacy.js');
const { joinRequest }=require('../lib/community/validation.js');
const { createReport, issueWarning }=require('../lib/community/moderation.js');

// SQL driver fixture: tests service transactions without accessing local/production MySQL.
function fixture({ blocked = false, status = 'PENDING', existing = false } = {}) {
  const writes = [], events = [], state = { status, handoff: status === 'APPROVED' ? 'PENDING' : 'NOT_READY', membership: null, warningCount: 0, report: null, commits: 0, rollbacks: 0, releases: 0 }
  const config = { feature_enabled: 1, applications_enabled: 1, privacy_text: 'Configured notice', rules_text: 'Configured rules', rules_version: '1', privacy_version: '1', screening_patterns: [], low_risk_threshold: 30, high_risk_threshold: 60, warning_policy: ['WARNING','FINAL_WARNING','REMOVAL_RECOMMENDED'] }
  const connection = {
    beginTransaction: async () => {}, commit: async () => { state.commits++ }, rollback: async () => { state.rollbacks++ }, release: () => { state.releases++ },
    execute: async (sql, params = []) => {
      if (sql.startsWith('SELECT * FROM community_settings')) return [[config]]
      if (sql.startsWith('SELECT * FROM community_groups')) return [[{ id: 1, status: 'ACTIVE', is_public: 1, accepting_applications: 1 }]]
      if (sql.startsWith('SELECT * FROM community_members WHERE')) return [[{ id: 7, status: 'PENDING', anonymized_at: null }]]
      if (sql.startsWith('SELECT * FROM community_reports')) return [[state.report]]
      if (sql.startsWith('SELECT * FROM community_join_requests WHERE')) return [[{ id: 12, member_id: 7, group_id: 1, status: state.status, handoff_status: state.handoff, reason: 'I want to meet neighbours and share useful advice.' }]]
      if (sql.startsWith('SELECT id FROM community_join_requests')) return [existing ? [{ id: 10 }] : []]
      if (sql.includes('COUNT(*) AS total, SUM(created_at')) return [[{ total: existing ? 2 : 0, recent: 0, rejected: existing ? 1 : 0 }]]
      if (sql.includes('SELECT COUNT(*) AS total FROM community_blocks')) return [[{ total: blocked ? 1 : 0 }]]
      if (sql.includes('COUNT(*) AS total FROM community_warnings')) return [[{ total: state.warningCount }]]
      if (sql.includes("SUM(status = 'ACTIVE') AS active")) return [[{ active: state.membership === 'ACTIVE' ? 1 : 0, warned: 0, pending: state.membership === 'PENDING' ? 1 : 0 }]]
      if (sql.startsWith('SELECT recommendation')) return [[{ recommendation: 'REVIEW' }]]
      writes.push({ sql, params })
      if (sql.startsWith('INSERT INTO community_members (')) return [{ insertId: 7 }]
      if (sql.startsWith('INSERT INTO community_join_requests')) return [{ insertId: 12 }]
      if (sql.startsWith('INSERT INTO community_audit_logs')) { events.push({ actor: params[1], action: params[2], metadata: JSON.parse(params[5]) }); return [{ insertId: events.length }] }
      if (sql.startsWith('INSERT INTO community_screening_results')) return [{ insertId: 1 }]
      if (sql.startsWith('UPDATE community_join_requests SET status')) { state.status = params[0]; state.handoff = params[5]; return [{ affectedRows: 1 }] }
      if (sql.startsWith('UPDATE community_join_requests SET handoff_status')) { state.handoff = params[0]; return [{ affectedRows: 1 }] }
      if (sql.startsWith('INSERT INTO community_memberships')) { state.membership = 'PENDING'; return [{ insertId: 1 }] }
      if (sql.startsWith("UPDATE community_memberships SET status = 'ACTIVE'")) { state.membership = 'ACTIVE'; return [{ affectedRows: 1 }] }
      if (sql.startsWith('UPDATE community_members SET status')) return [{ affectedRows: 1 }]
      if (sql.startsWith('INSERT INTO community_reports')) { state.report = { id: 3, group_id: 1, reported_member_id: 7 }; return [{ insertId: 3 }] }
      if (sql.startsWith('INSERT INTO community_warnings')) { state.warningCount++; return [{ insertId: state.warningCount }] }
      throw new Error(`Unexpected fixture query: ${sql}`)
    }
  }
  return { pool: { getConnection: async () => connection }, connection, state, writes, events }
}
const application = joinRequest({ fullName: 'Example Person', phone: '+4917612345678', city: 'City', groupId: 1,
  reason: 'I want to meet neighbours and share useful advice.', rulesAccepted: true, privacyAccepted: true, rulesVersion: '1', privacyVersion: '1' })
const actor = { userId: null, kind: 'SHARED_ADMIN' }
test('blocked duplicate submission is preserved, screened for review, and audited without exposing history', async () => {
  const db = fixture({ blocked: true, existing: true })
  const result = await submitApplication(application, db.pool)
  assert.deepEqual(result, { message: 'Your request has been received and will be reviewed.' })
  const inserted = db.writes.find(item => item.sql.startsWith('INSERT INTO community_join_requests'))
  assert.ok(inserted.params.includes(10), 'duplicate history links the prior request')
  const screened = db.writes.find(item => item.sql.startsWith('INSERT INTO community_screening_results'))
  assert.equal(screened.params[2], 'REVIEW')
  assert.deepEqual(db.events.map(event => event.action), ['JOIN_REQUEST_CREATED','SCREENING_COMPLETED'])
  assert.equal(db.state.commits, 1); assert.equal(db.state.releases, 1)
})
test('stale acknowledgements roll back before creating any applicant/request', async () => {
  const db = fixture()
  await assert.rejects(submitApplication({ ...application, privacy_version: 'old' }, db.pool), error => error.status === 409)
  assert.equal(db.writes.length, 0); assert.equal(db.state.rollbacks, 1); assert.equal(db.state.commits, 0)
})
test('approval creates only pending membership and audits the human override', async () => {
  const db = fixture()
  const result = await decide(12, { status: 'APPROVED', reason: 'Reviewed manually' }, actor, db.pool)
  assert.equal(result.handoffStatus, 'PENDING'); assert.equal(db.state.handoff, 'PENDING'); assert.equal(db.state.membership, 'PENDING')
  assert.ok(db.events.some(event => event.action === 'SCREENING_OVERRIDDEN'))
  assert.equal(db.state.commits, 1)
  await assert.rejects(decide(12, { status: 'REJECTED' }, actor, db.pool), error => error.status === 409)
  assert.equal(db.state.commits, 1, 'a final decision cannot be overwritten')
})
test('rejection is recorded without creating membership; blocked approval cannot proceed', async () => {
  const rejected = fixture(); await decide(12, { status: 'REJECTED' }, actor, rejected.pool)
  assert.equal(rejected.state.membership, null); assert.equal(rejected.state.status, 'REJECTED')
  const blocked = fixture({ blocked: true })
  await assert.rejects(decide(12, { status: 'APPROVED' }, actor, blocked.pool), error => error.status === 409)
  assert.equal(blocked.writes.length, 0); assert.equal(blocked.state.rollbacks, 1)
})
test('only explicit manual handoff completion activates membership and records admission', async () => {
  const db = fixture({ status: 'APPROVED' })
  await completeHandoff(12, actor, db.pool)
  assert.equal(db.state.membership, 'ACTIVE'); assert.equal(db.state.handoff, 'COMPLETED')
  assert.ok(db.events.some(event => event.action === 'HANDOFF_COMPLETED'))
  await assert.rejects(completeHandoff(12, actor, db.pool), error => error.status === 409)
})
test('audit metadata drops credentials and applicant text; failures roll back and release', async () => {
  const db = fixture()
  await audit(db.connection, actor, 'TEST', 'MEMBER', 7, { status: 'ACTIVE', password: 'secret', phone: 'private', reason: 'private', token: 'secret' })
  assert.deepEqual(db.events[0].metadata, { status: 'ACTIVE' })
  await assert.rejects(transaction(async () => { throw new Error('Simulated failure') }, db.pool), /Simulated failure/)
  assert.equal(db.state.rollbacks, 1); assert.equal(db.state.releases, 1)
})
test('anonymization requires resolving an active block before losing phone-based protection', async () => {
  const db = fixture({ blocked: true })
  await assert.rejects(anonymizeMember(7, actor, db.pool), error => error.status === 409)
  assert.equal(db.writes.length, 0); assert.equal(db.state.rollbacks, 1)
})
test('recorded reports support progressive warnings without automatic blocking or WhatsApp removal', async () => {
  const db = fixture()
  const report = await createReport({ groupId: 1, memberId: 7, category: 'ADVERTISEMENT', description: 'Repeated unsolicited advertising was reported.' }, actor, false, db.pool)
  const levels = []
  for (let i = 0; i < 3; i++) {
    const result = await issueWarning({ memberId: 7, groupId: 1, reportId: report.id, reason: 'Administrator reviewed reported advertising.' }, actor, db.pool)
    levels.push(result.level)
  }
  assert.deepEqual(levels, ['WARNING','FINAL_WARNING','REMOVAL_RECOMMENDED'])
  assert.equal(db.events.filter(event => event.action === 'WARNING_ISSUED').length, 3)
  assert.ok(db.events.some(event => event.action === 'REPORT_CREATED'))
  assert.ok(!db.writes.some(item => item.sql.startsWith('INSERT INTO community_blocks')))
})
test('a report for another member cannot be used to issue a warning', async () => {
  const db = fixture()
  db.state.report = { id: 3, group_id: 1, reported_member_id: 999 }
  await assert.rejects(issueWarning({ memberId: 7, groupId: 1, reportId: 3, reason: 'Reviewed report' }, actor, db.pool), error => error.status === 400)
  assert.ok(!db.writes.some(item => item.sql.startsWith('INSERT INTO community_warnings')))
})

test('submission stores exact accepted notices, versions and server timestamps',async()=>{
 const db=fixture();await submitApplication(application,db.pool);const write=db.writes.find(w=>w.sql.startsWith('INSERT INTO community_join_requests'));assert.match(write.sql,/rules_text_snapshot/);assert.match(write.sql,/privacy_text_snapshot/);assert.ok(write.params.includes('Configured rules'));assert.ok(write.params.includes('Configured notice'));assert.equal(write.params.filter(p=>p instanceof Date).length,2);assert.doesNotMatch(JSON.stringify(db.events),/Configured notice|Configured rules/);
});
