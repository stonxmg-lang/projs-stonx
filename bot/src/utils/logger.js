'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LOG_FILE = path.join(LOG_DIR, 'stonx.log');

// Small in-memory tail so the Android app's "monitor" screen can poll
// GET /api/logs without reading the log file from disk on every request.
const RECENT_LOGS = [];
const MAX_RECENT = 300;
function pushRecent(entry) {
  RECENT_LOGS.push(entry);
  if (RECENT_LOGS.length > MAX_RECENT) RECENT_LOGS.shift();
}

// Fields that must never reach the log file/console, even accidentally.
const SENSITIVE_KEYS = [
  'pairingcode', 'pairing_code', 'authstate', 'creds', 'noisekey',
  'signedidentitykey', 'signedprekey', 'registrationid', 'advsecretkey',
  'qr', 'password', 'token'
];

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function format(level, message, meta) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {})
  };
  return JSON.stringify(entry);
}

function write(level, message, meta) {
  const line = format(level, message, meta);
  pushRecent(JSON.parse(line));
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {
    // Never let logging crash the bot.
  }
  const consoleMsg = `[${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(consoleMsg);
  else if (level === 'warn') console.warn(consoleMsg);
  else console.log(consoleMsg);
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  debug: (message, meta) => {
    if (process.env.STONX_DEBUG === '1') write('debug', message, meta);
  },
  getRecentLogs: () => RECENT_LOGS.slice()
};
