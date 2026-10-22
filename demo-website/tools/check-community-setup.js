'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configuration, plan, run, REQUIRED_TABLES } = require('./community-setup');

const env = { DB_HOST: 'localhost', DB_USER: 'fixture', DB_NAME: 'fixture' };
function fixture({ tables = REQUIRED_TABLES, initialized = true } = {}) {
  const queries = [], logs = [];
  let ended = 0;
  const connection = {
    execute: async sql => {
      queries.push(sql);
      if (sql.includes('information_schema')) return [[...tables.map(name => ({ name })), { name: 'admin_users' }]];
      return [initialized ? [{ feature_enabled: 0, applications_enabled: 0, privacy_length: 0 }] : []];
    },
    query: async sql => { queries.push(sql); return []; },
    end: async () => { ended++; },
  };
  return { queries, logs, connection, get ended() { return ended; } };
}
test('setup requires existing database configuration and explicitly selected mutation mode', () => {
  assert.throws(() => plan(configuration({})), /Configure/);
  assert.equal(plan(configuration(env)).apply, false);
  assert.throws(() => plan(configuration({ ...env, DB_HOST: 'live.example' }), ['--apply']), /Remote database writes/);
  assert.equal(plan(configuration(env), ['--apply']).apply, true);
  assert.throws(() => plan(configuration(env), ['--apply', '--check']), /Use --check/);
});
test('default setup check only reads state and closes its connection', async () => {
  const f = fixture();
  await run({ env, args: [], connect: async options => { assert.equal(options.multipleStatements, false); return f.connection; }, log: text => f.logs.push(text) });
  assert.ok(f.queries.every(sql => sql.startsWith('SELECT')));
  assert.equal(f.ended, 1);
  assert.ok(f.logs.some(text => text === 'Community enabled: false'));
});
test('explicit setup applies only community additive schema and preserving initialization', async () => {
  const f = fixture();
  await run({ env, args: ['--apply'], connect: async options => { assert.equal(options.multipleStatements, true); return f.connection; }, log: () => {} });
  const writes = f.queries.filter(sql => !sql.startsWith('SELECT'));
  assert.equal(writes.length, 5);
  assert.equal((writes[0].match(/CREATE TABLE IF NOT EXISTS/g) || []).length, 11);
  assert.match(writes[1], /ALTER TABLE community_groups ADD COLUMN custom_rules/);
  assert.match(writes[2], /ADD COLUMN image MEDIUMBLOB/);
  assert.match(writes[3], /ADD COLUMN rules_text_snapshot TEXT/);
  assert.match(writes[4], /INSERT IGNORE INTO community_settings/);
  assert.doesNotMatch(writes.join('\n'), /UPDATE\s+students|DROP\s+TABLE|TRUNCATE|feature_enabled\s*=\s*(?:1|TRUE)/i);
  assert.equal(f.ended, 1);
});
test('setup connection is closed on schema failure', async () => {
  const f = fixture();
  f.connection.query = async () => { throw Error('Synthetic failure'); };
  await assert.rejects(run({ env, args: ['--apply'], connect: async () => f.connection, log: () => {} }), /Synthetic failure/);
  assert.equal(f.ended, 1);
});
