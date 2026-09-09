'use strict';

// Using @innovatorssoft/baileys — a WhiskeySockets Baileys fork that keeps
// the same core exports (makeWASocket, DisconnectReason,
// fetchLatestBaileysVersion) per its published docs. Group-admin metadata
// shape (`groupMetadata().participants[].admin`) is standard Baileys and
// presumed unchanged in this fork; flag it here if it turns out otherwise.
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@innovatorssoft/baileys');
const pino = require('pino');
const path = require('path');

const config = require('../config');
const logger = require('../utils/logger');
const authManager = require('./authManager');
const qrAuth = require('./qrAuth');
const phoneAuth = require('./phoneAuth');
const { ReconnectScheduler } = require('./reconnect');
const events = require('../core/events');

// Note on 'readline' import removal: the auth-method choice and phone
// number used to be collected via a terminal prompt. Both are now supplied
// remotely by the Android control-panel app over the local HTTP API (see
// src/api/server.js) via ConnectionManager#setAuthMethodChoice and
// #submitPhoneNumber, so nothing here reads from stdin anymore.

// Baileys' internals call `.child()` on whatever `logger` we hand it (e.g.
// inside noise-handler setup) — it must be a real pino instance, not
// undefined. Normally silenced (our own app logging goes through
// utils/logger.js instead). Setting STONX_DEBUG=1 (same flag utils/logger.js
// already uses) switches it to verbose and writes Baileys' *own* internal
// logs to data/logs/baileys.log.
//
// Level is 'trace' (full detail) again now that the actual bug is patched
// at its source: @innovatorssoft/baileys' LIDMappingStore had several
// `(logger.trace || logger.debug)(...)` calls (lib/Signal/lid-mapping.js)
// that stripped `this` off the logging method, crashing every message that
// touched LID mapping whenever trace/debug output was enabled. That's fixed
// in the patched lid-mapping.js shipped alongside this project. If this
// node_modules file ever gets overwritten by a fresh `npm install`, the
// patch needs reapplying (or drop back to 'warn' here until it is).
const BAILEYS_LOG_FILE = path.join(__dirname, '..', '..', 'data', 'logs', 'baileys.log');
const baileysLogger = process.env.STONX_DEBUG === '1'
  ? pino({ level: 'trace' }, pino.destination({ dest: BAILEYS_LOG_FILE, sync: false }))
  : pino({ level: 'silent' });

class ConnectionManager {
  constructor() {
    if (ConnectionManager._instance) {
      // Enforce "single Connection Manager only" (spec section 4).
      return ConnectionManager._instance;
    }
    ConnectionManager._instance = this;

    this.sock = null;
    this.state = config.CONNECTION_STATE.STARTING;
    this.reconnectScheduler = new ReconnectScheduler();
    this.saveCreds = null;
    this._authMethodChoice = null; // cached so reconnects don't re-prompt
    this._shuttingDown = false;

    // Values the local control API (src/api/server.js) reads and writes.
    this.latestQr = null;
    this.latestPairingCode = null;
    this._methodChoiceResolve = null;
    this._phoneNumberResolve = null;
    this._pendingPhoneNumber = null;
  }

  /** Called by the API when the app picks 'phone' or 'qr'. */
  setAuthMethodChoice(choice) {
    this._authMethodChoice = choice;
    if (this._methodChoiceResolve) {
      const resolve = this._methodChoiceResolve;
      this._methodChoiceResolve = null;
      resolve(choice);
    }
  }

  _waitForAuthMethodChoice() {
    if (this._authMethodChoice) return Promise.resolve(this._authMethodChoice);
    this.state = config.CONNECTION_STATE.AWAITING_METHOD_CHOICE;
    events.emit('connection.state', this.state);
    return new Promise((resolve) => {
      this._methodChoiceResolve = resolve;
    });
  }

  /** Called by the API once the user submits a phone number from the app. */
  submitPhoneNumber(number) {
    if (this._phoneNumberResolve) {
      const resolve = this._phoneNumberResolve;
      this._phoneNumberResolve = null;
      resolve(number);
    } else {
      this._pendingPhoneNumber = number;
    }
  }

  _waitForPhoneNumber() {
    if (this._pendingPhoneNumber) {
      const number = this._pendingPhoneNumber;
      this._pendingPhoneNumber = null;
      return Promise.resolve(number);
    }
    this.state = config.CONNECTION_STATE.AWAITING_PHONE_NUMBER;
    events.emit('connection.state', this.state);
    return new Promise((resolve) => {
      this._phoneNumberResolve = resolve;
    });
  }

  /** Called by the API's "delete session / stop" button. */
  async requestLogout() {
    logger.info('Logout requested via local API');
    this._unbindSocket(this.sock);
    authManager.clearSession();
    this._authMethodChoice = null;
    this.latestQr = null;
    this.latestPairingCode = null;
    this.state = config.CONNECTION_STATE.LOGGED_OUT;
    events.emit('connection.state', this.state);
    if (!this._shuttingDown) await this._connect();
  }

  getSock() {
    return this.sock;
  }

  getState() {
    return this.state;
  }

  get ownJid() {
    return this.sock?.user?.id ? normalizeJid(this.sock.user.id) : null;
  }

  /**
   * WhatsApp is mid-migration to LID (Linked ID) addressing alongside the
   * old phone-number JIDs, and a given chat/sender may be reported in either
   * form depending on context. `sock.user.id` only gives us one of them, so
   * self-chat detection (router.js) needs to check against every identity
   * variant we can find for our own account, not just one.
   */
  get ownJids() {
    const candidates = [
      this.sock?.user?.id,
      this.sock?.user?.lid,
      this.sock?.authState?.creds?.me?.id,
      this.sock?.authState?.creds?.me?.lid
    ].filter(Boolean);
    return [...new Set(candidates.map(normalizeJid))];
  }

  async start() {
    this.state = config.CONNECTION_STATE.STARTING;
    await this._connect();
  }

  async _connect() {
    this.state = config.CONNECTION_STATE.CONNECTING;

    const { state, saveCreds } = await authManager.loadAuthState();
    this.saveCreds = saveCreds;

    const hadSession = authManager.hasExistingSession();
    console.log('Starting STONX...\n');

    if (!hadSession) {
      // Wait BEFORE the socket exists — waiting after would race against the
      // socket's own connection.update('qr') event, which could render a QR
      // code before the app even finished choosing phone-pairing instead.
      // The choice comes from the Android app via POST /api/method.
      if (!this._authMethodChoice) {
        logger.info('Waiting for auth method choice from app (phone or qr)');
        this._authMethodChoice = await this._waitForAuthMethodChoice();
      }
    } else {
      console.log('🔐 Existing session detected');
      console.log('🔄 Connecting...');
    }

    // VERIFY-AGAINST-YOUR-BAILEYS: fetchLatestBaileysVersion is optional but
    // recommended by upstream Baileys to keep the WA protocol version fresh.
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (_) {
      version = undefined; // fall back to the library's built-in default
    }

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false, // we render the QR ourselves
      logger: baileysLogger,
      // Without an explicit callback here, Baileys silently disables ALL
      // history sync when syncFullHistory is false/unset — including the
      // sync types that carry LID <-> phone-number mappings and group
      // participation data. Missing those mappings is exactly why sending
      // to a group containing "username"(@lid)-identified members hangs:
      // Baileys can't resolve/build a Signal session for that participant,
      // and the send times out inside assertSessions (well-documented
      // upstream, e.g. WhiskeySockets/Baileys #1875, #11951). We still
      // don't want a full chat-history download — just every sync type
      // except FULL (HistorySyncType.FULL === 2).
      syncFullHistory: false,
      shouldSyncHistoryMessage: ({ syncType }) => syncType !== 2
    });

    this._bindSocket(sock);
    this.sock = sock;

    if (!hadSession && this._authMethodChoice === '1') {
      // Wait for the app to submit the phone number via POST /api/phone,
      // then request the pairing code and hand it back through the API.
      const phoneNumber = await this._waitForPhoneNumber();
      this.state = config.CONNECTION_STATE.CONNECTING;
      events.emit('connection.state', this.state);
      try {
        const code = await phoneAuth.requestPairingCode(sock, phoneNumber);
        this.latestPairingCode = code;
        this.state = config.CONNECTION_STATE.AWAITING_PAIRING_CONFIRM;
        events.emit('pairing.code', code);
        events.emit('connection.state', this.state);
      } catch (err) {
        logger.error('Failed to request pairing code: ' + (err && err.message) + ' | stack: ' + (err && err.stack ? String(err.stack).split('\n').slice(0,3).join(' ') : 'n/a'));
        // Let the app try again with a corrected number.
        this._pendingPhoneNumber = null;
        this.state = config.CONNECTION_STATE.AWAITING_PHONE_NUMBER;
        events.emit('connection.state', this.state);
      }
    }
    // If choice === '2', QR is captured automatically from connection.update below.
  }

  /** Wires all listeners for one socket instance. Always paired with _unbindSocket on teardown. */
  _bindSocket(sock) {
    sock.ev.on('creds.update', this.saveCreds);

    sock.ev.on('connection.update', (update) => this._onConnectionUpdate(update));

    sock.ev.on('messages.upsert', (upsert) => {
      if (upsert.type !== 'notify') return;
      for (const message of upsert.messages || []) {
        events.emit('message.new', message);
      }
    });
  }

  /** Removes all listeners from a socket before discarding it — prevents leaks/duplicate handlers. */
  _unbindSocket(sock) {
    if (!sock) return;
    try {
      sock.ev.removeAllListeners();
    } catch (err) {
      logger.warn('Failed to remove listeners on old socket', { error: err.message });
    }
    try {
      sock.end?.(undefined);
    } catch (_) {
      // socket may already be closed
    }
  }

  async _onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr && this._authMethodChoice !== '1') {
      this.latestQr = qr;
      qrAuth.renderQr(qr);
      this.state = config.CONNECTION_STATE.AWAITING_QR_SCAN;
      events.emit('qr', qr);
      events.emit('connection.state', this.state);
    }

    if (connection === 'open') {
      this.reconnectScheduler.reset();
      this.state = config.CONNECTION_STATE.CONNECTED;
      this.latestQr = null;
      this.latestPairingCode = null;
      console.log('🟢 WhatsApp connected\n\nSTONX is ready.');
      logger.info('WhatsApp connection open', { jid: this.ownJid, ownJids: this.ownJids });
      events.emit('connection.state', this.state);
      return;
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        this.state = config.CONNECTION_STATE.LOGGED_OUT;
        logger.warn('Session logged out — clearing and returning to auth flow');
        events.emit('connection.state', this.state);
        this._unbindSocket(this.sock);
        authManager.clearSession();
        this._authMethodChoice = null;
        this.latestQr = null;
        this.latestPairingCode = null;
        if (!this._shuttingDown) await this._connect();
        return;
      }

      this.state = config.CONNECTION_STATE.DISCONNECTED;
      console.log('🟡 WhatsApp connection lost');
      logger.warn('Connection closed, will reconnect | statusCode=' + statusCode
        + ' | reason=' + (lastDisconnect?.error?.message || 'n/a'));
      events.emit('connection.state', this.state);

      this._unbindSocket(this.sock);
      this.state = config.CONNECTION_STATE.RECONNECTING;

      if (!this._shuttingDown) {
        this.reconnectScheduler.schedule(() => {
          console.log('⏳ Reconnecting...');
          this._connect()
            .then(() => console.log('🟢 WhatsApp connection restored'))
            .catch((err) => logger.error('Reconnect attempt failed', { error: err.message }));
        });
      }
    }
  }

  // ---- Facade helpers used by router/commands (kept here so nothing else touches `sock` directly) ----

  /**
   * VERIFY-AGAINST-YOUR-BAILEYS: `sock.sendMessage(jid, { text })` is the
   * standard text-send signature.
   *
   * Retries on transient "Timed Out" errors — these come from Baileys'
   * internal query timeout (e.g. building Signal sessions / fetching
   * participant prekeys the first time a group is messaged), not from
   * anything wrong with the message content, and are usually gone on the
   * next attempt.
   */
  async sendText(chatJid, text, { retries = 2 } = {}) {
    if (!this.sock) throw new Error('Socket not connected');
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.sock.sendMessage(chatJid, { text });
      } catch (err) {
        lastErr = err;
        const isTimeout = /timed out/i.test(err.message || '');
        const willRetry = isTimeout && attempt < retries;
        logger.warn('sendText attempt failed', { chatJid, attempt, error: err.message, willRetry });
        if (!willRetry) break;
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /**
   * VERIFY-AGAINST-YOUR-BAILEYS: group admin status normally comes from
   * `sock.groupMetadata(jid).participants[].admin` (values like 'admin' |
   * 'superadmin' | null/undefined). Confirm this shape on your fork.
   */
  async isGroupAdmin(chatJid, userJid) {
    if (!this.sock) return false;
    try {
      const meta = await this.sock.groupMetadata(chatJid);
      const participant = meta.participants.find((p) => normalizeJid(p.id) === normalizeJid(userJid));
      return !!participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
    } catch (err) {
      logger.warn('Failed to resolve group admin status', { chatJid, error: err.message });
      return false;
    }
  }

  async shutdown() {
    this._shuttingDown = true;
    this.reconnectScheduler.cancel();
    this._unbindSocket(this.sock);
    this.sock = null;
    this.state = config.CONNECTION_STATE.DISCONNECTED;
  }
}

function normalizeJid(jid) {
  if (typeof jid !== 'string' || !jid.includes('@')) return jid;
  const [user, server] = jid.split('@');
  const bareUser = user.split(':')[0].split('/')[0];
  return `${bareUser}@${server}`;
}

module.exports = { ConnectionManager };
