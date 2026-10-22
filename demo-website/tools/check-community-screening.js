const test=require('node:test');
const assert=require('node:assert/strict');
const { ruleBasedAssessment, nextWarningLevel }=require('../lib/community/screening.js');

test('ordinary requests receive an explainable recommendation without API credentials', () => {
  const result = ruleBasedAssessment({ reason: 'I would like to help neighbours find local accommodation.' })
  assert.equal(result.recommendation, 'APPROVE'); assert.equal(result.riskScore, 0)
  assert.ok(result.screeningVersion); assert.ok(result.reasons.length)
})
test('identity, duplicate profile and previous rejection alone never increase risk', () => {
  const base = { reason: 'I would like to meet people in this city.' }
  assert.equal(ruleBasedAssessment({ ...base, full_name: 'Any Name', city: 'Any City' }, { existingMember: true, previouslyRejected: true }).riskScore, 0)
})
test('blocked resubmissions always require human review, including high commercial risk', () => {
  const result = ruleBasedAssessment({ reason: 'Buy now https://example.invalid limited time offer' }, { blocked: true, spamWarnings: 3 })
  assert.equal(result.riskScore, 100); assert.equal(result.recommendation, 'REVIEW'); assert.ok(result.signals.includes('BLOCKED'))
})
test('URLs alone do not reject; combined explicit promotional signals may recommend rejection', () => {
  assert.notEqual(ruleBasedAssessment({ reason: 'Local information https://example.invalid' }).recommendation, 'REJECT')
  const result = ruleBasedAssessment({ reason: 'Buy now, discount code, special sale https://example.invalid' }, {}, { screening_patterns: ['special sale'] })
  assert.equal(result.recommendation, 'REJECT'); assert.equal(result.riskScore, 80)
})
test('progressive default policy ends at removal recommendation, never automatic blocking', () => {
  assert.deepEqual([0, 1, 2, 8].map(count => nextWarningLevel(count)), ['WARNING', 'FINAL_WARNING', 'REMOVAL_RECOMMENDED', 'REMOVAL_RECOMMENDED'])
})
