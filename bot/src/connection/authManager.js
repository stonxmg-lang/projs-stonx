'use strict';

// Confirmed against @innovatorssoft/baileys' published docs: `useMultiFileAuthState`
// keeps the same name/signature as upstream Baileys in this fork.
const { useMultiFileAuthState } = require('@innovatorssoft/baileys');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

if (!fs.existsSync(config.AUTH_DIR)) {
  fs.mkdirSync(config.AUTH_DIR, { recursive: true });
}

/**
 * A creds.json file exists as soon as a socket is created for the very
 * first time (Baileys writes out the freshly-generated noise/identity keys
 * on its first internal 'creds.update', well before any QR scan or pairing
 * code is actually used) — so file *existence* alone does not mean a
 * session is usable. Baileys only sets `registered: true` once pairing
 * genuinely completes. Resuming a socket from an unregistered creds file
 * is always rejected by WhatsApp, which used to send us straight back into
 * a clear-session-and-reprompt loop (e.g. after a pairing code simply
 * expired unused) — this is what made reconnects feel unstable.
 */
function hasExistingSession() {
  try {
    const credsPath = path.join(config.AUTH_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const parsed = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    return !!(parsed && parsed.registered);
  } catch (_) {
    return false;
  }
}

async function loadAuthState() {
  // NEVER log `state.creds` or `state.keys` — they contain the full session.
  const { state, saveCreds } = await useMultiFileAuthState(config.AUTH_DIR);
  logger.info('Auth state loaded', { existingSession: hasExistingSession() });
  return { state, saveCreds };
}

function clearSession() {
  try {
    fs.rmSync(config.AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(config.AUTH_DIR, { recursive: true });
    logger.info('Session cleared (logged out)');
  } catch (err) {
    logger.error('Failed to clear session directory', { error: err.message });
  }
}

module.exports = { loadAuthState, hasExistingSession, clearSession };
