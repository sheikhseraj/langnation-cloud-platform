'use strict';
const crypto = require('node:crypto');
const DEFAULT_PROMOTIONS = Object.freeze({ announcements: true, coursePromotions: true, exemptApprovedPosts: true });
function policies(settings) {
  const saved = settings.notification_preferences?.communityPolicy || {};
  return { group_policy: saved.groupPolicy || 'INHERIT', admin_promotional_policy: { ...DEFAULT_PROMOTIONS, ...saved.adminPromotions } };
}
function effectiveRules(group, config) {
  const custom = policies(config).group_policy === 'CUSTOM' && Boolean(group.custom_rules?.trim());
  return {
    rules: config.rules_text + (custom ? '\n\nGroup-specific rules\n' + group.custom_rules : ''),
    rulesVersion: custom ? 'group-' + crypto.createHash('sha256').update(JSON.stringify([config.rules_version, group.id, group.custom_rules_version, group.custom_rules])).digest('hex').slice(0, 32) : config.rules_version,
    customRules: custom ? group.custom_rules : '',
  };
}
function approvedPostExempt(report, config) {
  const policy = policies(config).admin_promotional_policy;
  return Boolean(report.approved_admin_post && policy.exemptApprovedPosts &&
    (report.admin_post_type === 'COURSE_PROMOTION' ? policy.coursePromotions : policy.announcements));
}
module.exports = { DEFAULT_PROMOTIONS, policies, effectiveRules, approvedPostExempt };
