"use strict";
const { createCipheriv, createDecipheriv, randomBytes, createHmac } = require('node:crypto');
const { CommunityError } = require('./validation.js');

function sameOrigin(req, res, next) {
  const origin = req.get('origin'), expected = process.env.COMMUNITY_ORIGIN || `${req.protocol}://${req.get('host')}`
  if ((origin && origin !== expected) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed' })
  next()
}
function privateResponses(_req, res, next) {
  res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); res.removeHeader('Access-Control-Allow-Origin'); next()
}
function rateLimit({ limit = 10, windowMs = 3600000, key = req => req.ip, maxEntries = 10000 } = {}) {
  const buckets = new Map(), salt = randomBytes(32)
  return (req, res, next) => {
    const now = Date.now(), fingerprint = createHmac('sha256', salt).update(String(key(req))).digest('hex')
    let bucket = buckets.get(fingerprint)
    if (!bucket || bucket.reset <= now) {
      for (const [stored, value] of buckets) if (value.reset <= now) buckets.delete(stored)
      if (buckets.size >= maxEntries) return res.status(429).json({ error: 'Please try again later' })
      bucket = { count: 0, reset: now + windowMs }; buckets.set(fingerprint, bucket)
    }
    if (++bucket.count > limit) { res.set('Retry-After', String(Math.ceil((bucket.reset - now) / 1000))); return res.status(429).json({ error: 'Please try again later' }) }
    next()
  }
}
function requireCommunityAdmin(req, res, next) {
  if (!require('../../routes/admin').isAuthed(req)) return res.status(401).json({ error: 'Administrator authentication required' });
  req.communityActor = { userId: null, kind: 'SHARED_ADMIN' };
  next();
}
function csrfProtection(req, res, next) {
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && !require('../csrf').valid(req)) return res.status(403).json({ error: 'Refresh the page and try again' });
  next();
}
function bodyLimit(maxBytes) {
  return (req,res,next) => {
    if (req.body !== undefined && Buffer.byteLength(JSON.stringify(req.body), 'utf8') > maxBytes) return res.status(413).json({error:'Request too large'});
    next();
  };
}
function compatibleRouter() {
  const router = require('express').Router();
  // Express 4 does not forward rejected async handlers. Adapt at registration.
  for (const method of ['get','post','patch','put','delete']) {
    const register = router[method].bind(router);
    router[method] = (route, ...handlers) => register(route, ...handlers.map(handler => (req,res,next) => {
      try { Promise.resolve(handler(req,res,next)).catch(next); } catch (error) { next(error); }
    }));
  }
  return router;
}
function encryptionKey() {
  const value = process.env.COMMUNITY_ENCRYPTION_KEY || ''
  if (!/^[a-f\d]{64}$/i.test(value)) throw new CommunityError(503, 'Community invite encryption is not configured')
  return Buffer.from(value, 'hex')
}
function encryptInvite(link) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(link, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}
function decryptInvite(value) {
  if (!value) return null
  const [version, iv, tag, data] = value.split('.')
  if (version !== 'v1') throw new CommunityError(503, 'Unsupported invite encryption version')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}
function communityErrors(error, _req, res, _next) {
  if (error instanceof CommunityError) return res.status(error.status).json({ error: error.message })
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' })
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Invalid JSON' })
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A conflicting record already exists' })
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Referenced record does not exist' })
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'ECONNREFUSED') return res.status(503).json({ error: 'Community database unavailable; verify migration and configuration' })
  console.error('Community operation failed:', error.code || error.name)
  res.status(500).json({ error: 'Community operation failed' })
}

module.exports = { sameOrigin, privateResponses, rateLimit, requireCommunityAdmin, csrfProtection, bodyLimit, compatibleRouter, encryptInvite, decryptInvite, communityErrors };
