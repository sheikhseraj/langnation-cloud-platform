const test=require('node:test');
const assert=require('node:assert/strict');
const { joinRequest, normalizePhone, pagination }=require('../lib/community/validation.js');
const { encryptInvite, decryptInvite }=require('../lib/community/security.js');
const { publicGroup, safeGroup }=require('../lib/community/repository.js');

const valid = { fullName: 'Example Applicant', phone: '+49 176 1234 5678', city: 'Magdeburg', groupId: 1,
  reason: 'I would like to meet neighbours and share local advice.', rulesAccepted: true, privacyAccepted: true, rulesVersion: '1', privacyVersion: '1' }
test('international formatting variants normalize to the same duplicate identifier', () => {
  assert.equal(normalizePhone('+49 (176) 1234-5678'), '+4917612345678')
  assert.equal(normalizePhone('0049 176 12345678'), '+4917612345678')
  assert.equal(joinRequest(valid).normalized_phone, '+4917612345678')
  for (const phone of ['017612345678', 'abc', '+0000000000', '+11111111111', '+49; DROP TABLE users']) assert.throws(() => normalizePhone(phone))
})
test('applications require current acknowledgements, bounded text, and meaningful reasons', () => {
  for (const patch of [{ rulesAccepted: false }, { privacyAccepted: 'true' }, { reason: 'aaaaaaaaaaaaaaaaaaaa' }, { reason: 'x'.repeat(2001) },
    { fullName: {} }, { groupId: '1 OR 1=1' }, { city: 'City\u0000' }, { rulesVersion: undefined }]) assert.throws(() => joinRequest({ ...valid, ...patch }))
  assert.equal(joinRequest({ ...valid, fullName: '  Example Applicant  ' }).full_name, 'Example Applicant')
  assert.throws(() => pagination({ limit: '999999' }))
})
test('public and ordinary admin group serializers exclude private invite fields', () => {
  const group = { id: 1, name: 'Group', status: 'ACTIVE', accepting_applications: 1, invite_link_encrypted: 'private ciphertext', inviteLink: 'private raw link', instructions: 'Private instructions' }
  assert.doesNotMatch(JSON.stringify(publicGroup(group)), /private|instructions|invite/i)
  assert.equal(safeGroup({ ...group, inviteLink: undefined }).invite_link_encrypted, undefined)
})
test('invite ciphertext is authenticated, randomized and requires a configured key', () => {
  const previous = process.env.COMMUNITY_ENCRYPTION_KEY
  process.env.COMMUNITY_ENCRYPTION_KEY = 'a'.repeat(64)
  try {
    const link = 'https://chat.whatsapp.com/Example123', encrypted = encryptInvite(link)
    assert.equal(decryptInvite(encrypted), link)
    assert.notEqual(encryptInvite(link), encrypted)
    assert.ok(!encrypted.includes(link))
    const parts = encrypted.split('.'); parts[2] = Buffer.alloc(16).toString('base64')
    assert.throws(() => decryptInvite(parts.join('.')))
    delete process.env.COMMUNITY_ENCRYPTION_KEY
    assert.throws(() => encryptInvite(link), /not configured/)
  } finally { if (previous === undefined) delete process.env.COMMUNITY_ENCRYPTION_KEY; else process.env.COMMUNITY_ENCRYPTION_KEY = previous }
})
