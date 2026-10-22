'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('../lib/env');
const { classify } = require('../lib/migrate');

const REQUIRED_TABLES = [
  'community_groups', 'community_members', 'community_memberships',
  'community_join_requests', 'community_screening_results', 'community_reports',
  'community_warnings', 'community_blocks', 'community_admin_notes',
  'community_audit_logs', 'community_settings',
];

function configuration(env = process.env) {
  return {
    host: env.DB_HOST || '', port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || '', password: env.DB_PASSWORD || '', database: env.DB_NAME || '',
    timezone: 'Z', connectTimeout: 5000,
  };
}

function plan(config, args = []) {
  const unknown = args.filter(arg => !['--check', '--apply', '--allow-remote'].includes(arg));
  if (unknown.length || (args.includes('--check') && args.includes('--apply'))) {
    throw new Error('Use --check (default) or --apply. --allow-remote requires a deliberately selected staging database.');
  }
  if (!config.host || !config.user || !config.database) {
    throw new Error('Configure DB_HOST, DB_USER and DB_NAME in the local .env first. Keep DB_PASSWORD private.');
  }
  const apply = args.includes('--apply');
  if (apply && !['localhost', '127.0.0.1', '::1'].includes(config.host.toLowerCase()) && !args.includes('--allow-remote')) {
    throw new Error('Remote database writes are disabled by default. Review the staging destination and backup before using --allow-remote.');
  }
  return { apply };
}

async function inspect(connection) {
  const [tables] = await connection.execute(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  const present = new Set(tables.map(row => row.name));
  const missing = REQUIRED_TABLES.filter(name => !present.has(name));
  let settings = null;
  if (present.has('community_settings')) {
    const [rows] = await connection.execute(
      'SELECT feature_enabled, applications_enabled, public_reporting_enabled, rules_version, privacy_version, LENGTH(TRIM(privacy_text)) AS privacy_length FROM community_settings WHERE id = 1',
    );
    settings = rows[0] || null;
  }
  return { missing, hasAdminUsers: present.has('admin_users'), settings };
}

async function run({ args = process.argv.slice(2), env = process.env, connect, log = console.log } = {}) {
  const config = configuration(env), action = plan(config, args);
  const schema = fs.readFileSync(path.join(__dirname, '../MySQL/38_community.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(__dirname, '../MySQL/community-settings.sql'), 'utf8');
  if (classify(schema) !== 'schema') throw new Error('Community schema is not additive; refusing to apply it.');
  connect ||= require('mysql2/promise').createConnection;
  // Match the existing migration runner: a dedicated short-lived connection,
  // never multipleStatements on the shared request-serving database pool.
  const connection = await connect({ ...config, multipleStatements: action.apply });
  try {
    let state = await inspect(connection);
    if (action.apply) {
      if (!state.hasAdminUsers) throw new Error('Existing LangNation admin_users schema is missing. Select the existing LangNation database; this command does not create a replacement database.');
      // CREATE TABLE IF NOT EXISTS + INSERT IGNORE preserve existing data.
      // MySQL DDL implicitly commits; a partial failure can be rerun safely.
      await connection.query(schema);
      await connection.query(fs.readFileSync(path.join(__dirname,'../MySQL/39_community_policy.sql'),'utf8'));
      await connection.query(fs.readFileSync(path.join(__dirname,'../MySQL/40_community_presentation.sql'),'utf8'));
      await connection.query(fs.readFileSync(path.join(__dirname,'../MySQL/41_community_consent.sql'),'utf8'));
        await connection.query(seed);
      state = await inspect(connection);
      log('Community schema and initial settings applied. Existing settings were preserved.');
    }
    log(state.missing.length ? 'Missing community tables: ' + state.missing.join(', ') : 'All 11 community tables are present.');
    if (!state.settings) log('Initial settings are missing. Run --apply after reviewing the schema and backing up the database.');
    else {
      log('Community enabled: ' + Boolean(state.settings.feature_enabled));
      log('Applications enabled: ' + Boolean(state.settings.applications_enabled));
      log('Privacy notice configured: ' + Boolean(state.settings.privacy_length));
    }
    log('Existing settings are preserved. Fresh initialization uses the requested recommended defaults; review availability in admin. This command creates no public groups, sends no messages and runs no unrelated migrations.');
    return state;
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  loadEnv();
  run().catch(error => {
    // Do not print connection objects, credentials or raw DB error details.
    console.error(error.code ? 'Community setup failed (' + error.code + '). Verify the private connection settings.' : error.message);
    process.exitCode = 1;
  });
}

module.exports = { configuration, plan, inspect, run, REQUIRED_TABLES };
