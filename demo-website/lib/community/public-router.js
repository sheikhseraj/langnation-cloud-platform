"use strict";
const express = require('express');
const { database, settings, publicGroup } = require('./repository.js');
const { joinRequest } = require('./validation.js');
const { submitApplication } = require('./applications.js');
const { createReport } = require('./moderation.js');
const { sameOrigin, privateResponses, rateLimit, communityErrors, compatibleRouter, csrfProtection, bodyLimit } = require('./security.js');

function createPublicRouter({ getDatabase = database, getSettings = settings, submit = submitApplication } = {}) {
  const router = compatibleRouter()
  router.use(privateResponses, sameOrigin, rateLimit({ limit: 120, windowMs: 60000 }), express.json({ limit: '16kb' }), bodyLimit(16384), csrfProtection)
  router.get('/config', async (_req, res) => {
    const config = await getSettings()
    res.json({ enabled: Boolean(config.feature_enabled), applicationsEnabled: Boolean(config.feature_enabled && config.applications_enabled),
      rules: config.rules_text, rulesVersion: config.rules_version,
      privacyNotice: config.privacy_text, privacyVersion: config.privacy_version,
      publicReportingEnabled: Boolean(config.feature_enabled && config.public_reporting_enabled) })
  })
  router.get('/groups', async (_req, res) => {
    const config = await getSettings()
    if (!config.feature_enabled) return res.json([])
    const [groups] = await getDatabase().execute("SELECT id, name, slug, city, description, status, accepting_applications, custom_rules, custom_rules_version, community_name, current_member_count, image_updated_at FROM community_groups WHERE status = 'ACTIVE' AND is_public = TRUE ORDER BY city, name")
    res.json(groups.map(group=>({...publicGroup(group),...require('./policy').effectiveRules(group,config)})))
  })
  router.get('/groups/:id/image',async(req,res)=>{
    const config=await getSettings();if(!config.feature_enabled)return res.status(404).end();
    const photo=await require('./group-image').readImage(req.params.id,true,getDatabase());res.type(photo.type).send(photo.buffer);
  });
  router.use((req, res, next) => {
    if (req.method === 'POST' && req.body?.website) return res.status(400).json({ error: 'Unable to process submission' });
    next();
  });
  router.use((req, res, next) => {
    if (req.method === 'POST' && req.body?.website) return res.status(400).json({ error: 'Unable to process submission' });
    next();
  });
  const phoneLimit = rateLimit({ limit: 5, key: req => req.application.normalized_phone })
  router.post('/join-requests', rateLimit(), (req, _res, next) => { req.application = joinRequest(req.body); next() }, phoneLimit, async (req, res) => {
    res.status(201).json(await submit(req.application))
  })
  router.post('/reports', rateLimit({ limit: 5 }), async (req, res) => res.status(201).json(await createReport(req.body, null, true)))
  router.use(communityErrors)
  return router
}


module.exports = { createPublicRouter };
