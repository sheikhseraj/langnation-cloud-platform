'use strict';
const { transaction, settings, decode } = require('./repository');
const { CommunityError, text, integer, boolean, choice, LEVELS } = require('./validation');
const { audit } = require('./audit');
const { policies } = require('./policy');

async function changeSettings(body, actor, pool) {
  const data = {}, virtual = {}, validators = {
    feature_enabled: v => boolean(v, 'Feature'), applications_enabled: v => boolean(v, 'Applications'),
    public_reporting_enabled: v => boolean(v, 'Public reporting'),
    rules_text: v => text(v, 'Rules', 10000), privacy_text: v => text(v, 'Privacy notice', 10000),
    rules_version: v => text(v, 'Rules version', 64), privacy_version: v => text(v, 'Privacy version', 64),
    low_risk_threshold: v => integer(v, 'Low-risk threshold', 0, 100), high_risk_threshold: v => integer(v, 'High-risk threshold', 0, 100),
    retention_days: v => integer(v, 'Review period', 1, 3650),
    ai_enabled: v => { if (boolean(v, 'AI')) throw new CommunityError(400, 'AI screening is disabled; a paid integration requires separate approval'); return false; },
    default_handoff_mode: v => choice(v, ['MANUAL'], 'handoff mode'),
    screening_patterns: v => {
      if (!Array.isArray(v) || v.length > 100) throw new CommunityError(400, 'Provide at most 100 plain-text phrases');
      return JSON.stringify(v.map(p => { const phrase = text(p, 'Phrase', 200, { min: 4 }); if (/[<>]/.test(phrase)) throw new CommunityError(400, 'Advertisement phrases must be plain text, without markup'); return phrase; }));
    },
    warning_policy: v => {
      if (!Array.isArray(v) || !v.length || v.length > 5) throw new CommunityError(400, 'Warning progression must contain 1–5 entries');
      return JSON.stringify(v.map(level => choice(level, LEVELS.filter(x => x !== 'BLOCKED'), 'warning level')));
    },
    notification_preferences: v => {
      if (!v || typeof v !== 'object' || Array.isArray(v) || v.applicantDelivery !== 'MANUAL' || typeof v.dashboard !== 'boolean' || Object.keys(v).some(k => !['dashboard','applicantDelivery'].includes(k))) throw new CommunityError(400, 'Only dashboard notifications and manual applicant delivery are available');
      return v;
    },
    group_policy: v => choice(v, ['INHERIT','CUSTOM'], 'group policy'),
    admin_promotional_policy: v => {
      if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 3 || Object.keys(v).some(k => !['announcements','coursePromotions','exemptApprovedPosts'].includes(k))) throw new CommunityError(400, 'Invalid admin promotional-post policy');
      return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,boolean(x,k)]));
    },
  };
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CommunityError(400, 'A settings object is required');
  for (const [key,value] of Object.entries(body)) {
    if (!Object.hasOwn(validators,key)) throw new CommunityError(400, 'Unsupported setting');
    (['group_policy','admin_promotional_policy'].includes(key) ? virtual : data)[key] = validators[key](value);
  }
  if (!Object.keys(data).length && !Object.keys(virtual).length) throw new CommunityError(400, 'No changes provided');
  return transaction(async connection => {
    const existing = await settings(connection,true), merged = {...existing,...data};
    if (merged.low_risk_threshold >= merged.high_risk_threshold) throw new CommunityError(400, 'Low-risk threshold must be lower than high-risk threshold');
    for (const [content,version] of [['rules_text','rules_version'],['privacy_text','privacy_version']]) {
      if (data[content] !== undefined && data[content] !== existing[content] && merged[version] === existing[version]) throw new CommunityError(400, 'Increase '+version+' when changing the corresponding text materially');
    }
    if (merged.feature_enabled) {
      if (!merged.rules_text?.trim() || !merged.privacy_text?.trim()) throw new CommunityError(400,'Rules and privacy notice are required before enabling the community');
      if (!(process.env.SESSION_SECRET?.length >= 32 && (process.env.ADMIN_PASSWORD_HASH || (process.env.ADMIN_PASSWORD?.length >= 12 && process.env.ADMIN_PASSWORD !== 'admin123')))) throw new CommunityError(503,'Strong existing administrator/session configuration is required');
    }
    if (data.notification_preferences || Object.keys(virtual).length) {
      const policy = {...policies(existing),...virtual};
      data.notification_preferences = JSON.stringify({...existing.notification_preferences,...data.notification_preferences,
        communityPolicy:{groupPolicy:policy.group_policy,adminPromotions:policy.admin_promotional_policy}});
    }
    const fields=Object.keys(data);
    const [updated] = await connection.execute('UPDATE community_settings SET '+fields.map(k=>k+' = ?').join(', ')+' WHERE id = 1',Object.values(data));
    if (updated.affectedRows !== 1) throw new CommunityError(409,'Settings were not saved. Reload and try again.');
    await audit(connection,actor,'SETTINGS_CHANGED','SETTINGS',1,{fields:[...fields,...Object.keys(virtual)]});
    for (const [keys,event] of [[['rules_text'],'RULES_CHANGED'],[['privacy_text'],'PRIVACY_NOTICE_CHANGED'],[['warning_policy'],'WARNING_POLICY_CHANGED'],[['low_risk_threshold','high_risk_threshold'],'RISK_THRESHOLDS_CHANGED'],[['admin_promotional_policy'],'ADMIN_PROMOTIONAL_POLICY_CHANGED']]) {
      if (keys.some(k=>Object.hasOwn(body,k) && JSON.stringify(body[k])!==JSON.stringify(existing[k]??policies(existing)[k]))) await audit(connection,actor,event,'SETTINGS',1,{fields:keys});
    }
    return {success:true,settings:decode({...existing,...data}),...virtual};
  },pool);
}
module.exports={changeSettings};
