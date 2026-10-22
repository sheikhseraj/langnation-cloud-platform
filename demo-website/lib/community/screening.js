"use strict";
const SCREENING_VERSION = 'rules-1.1.0'
function ruleBasedAssessment(application, history = {}, settings = {}) {
  const signals = [], reasons = []
  let score = 0
  const add = (code, weight, reason) => { signals.push(code); score += weight; reasons.push(reason) }
  const reason = application.reason || ''
  if (/(https?:\/\/|www\.)\S+/i.test(reason)) add('URL', 15, 'Application contains a URL; review its relevance.')
  if (/\b(buy now|discount code|promote my business|sell my products|advertise my|limited time offer|earn money fast)\b/i.test(reason)) add('SOLICITATION', 35, 'Application contains clear commercial solicitation wording.')
  if ((settings.screening_patterns || []).some(pattern => reason.toLowerCase().includes(pattern.toLowerCase()))) add('ADVERTISEMENT_PATTERN', 30, 'Application matches an administrator-maintained advertisement pattern.')
  if (history.recentRequests >= 2) add('REPEATED_SUBMISSION', 15, 'Multiple recent applications are recorded.')
  if (history.spamWarnings) add('RECORDED_SPAM', Math.min(45, history.spamWarnings * 15), 'Recorded spam-related warnings require review.')
  if (history.blocked) add('BLOCKED', 70, 'An active internal block requires a human review.')
  if (history.previouslyRejected) reasons.push('A previous rejection is recorded; inspect its context before deciding.')
  if (history.existingMember) reasons.push('Existing member profile matched by phone; this does not verify phone ownership.')
  const riskScore = Math.min(100, Math.max(0, score))
  const low = settings.low_risk_threshold ?? 30, high = settings.high_risk_threshold ?? 60
  const clearPolicySignal = signals.includes('SOLICITATION')
  const recommendation = history.blocked ? 'REVIEW' : riskScore > high && clearPolicySignal ? 'REJECT' : riskScore > low ? 'REVIEW' : 'APPROVE'
  if (!reasons.length) reasons.push('No configured risk signals detected. Administrator approval is still required.')
  return { riskScore, recommendation, reasons, signals, screeningVersion: SCREENING_VERSION, screenedAt: new Date() }
}
// Credentials alone never enable AI; Phase 2 makes no provider calls.
class CommunityScreeningService {
  assess(application, history, settings) { return ruleBasedAssessment(application, history, settings) }
}
function nextWarningLevel(count, policy = ['WARNING', 'FINAL_WARNING', 'REMOVAL_RECOMMENDED']) { return policy[Math.min(count, policy.length - 1)] }

module.exports = { SCREENING_VERSION, ruleBasedAssessment, CommunityScreeningService, nextWarningLevel };
