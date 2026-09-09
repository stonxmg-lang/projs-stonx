'use strict';

// Confirmed against @innovatorssoft/baileys' published docs: `useMultiFileAuthState`
// keeps the same name/signature as upstream Baileys in this fork.
const { useMultiFileAuthState } = require('@innovatorssoft/baileys');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

if (!fs.existsSync(config.AUTH_DIR)) {
  fs.mkdirSync(config.AUTH_DIR, { recursive: true });
}

function hasExistingSession() {
  try {
    const files = fs.readdirSync(config.AUTH_DIR);
    return files.some((f) => f === 'creds.json');
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
