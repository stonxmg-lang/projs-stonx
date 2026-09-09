'use strict';

const logger = require('../utils/logger');
const events = require('./events');
const { loadCommands } = require('./command');
const { Router } = require('./router');
const { ConnectionManager } = require('../connection/connectionManager');
const { startApiServer } = require('../api/server');
const { sharedQueue } = require('../services/downloadQueue');
const videoDownloader = require('../services/videoDownloader');
const audioDownloader = require('../services/audioDownloader');
const audioExtractor = require('../services/audioExtractor');
const storyService = require('../services/storyService');
const voiceService = require('../services/voiceService');
const targetResolver = require('../services/targetResolver');
const whatsappMedia = require('../services/whatsappMedia');
const settingsRepo = require('../database/settings');

class Bot {
  constructor() {
    this.connectionManager = new ConnectionManager();
    this.services = {
      queue: sharedQueue,
      videoDownloader,
      audioDownloader,
      audioExtractor,
      storyService,
      voiceService,
      targetResolver,
      whatsappMedia
    };
    this.router = null;
    this._startedAt = null;
  }

  get ownJid() {
    return this.connectionManager.ownJid;
  }

  get ownJids() {
    return this.connectionManager.ownJids;
  }

  get uptimeMs() {
    return this._startedAt ? Date.now() - this._startedAt : 0;
  }

  async sendText(chatJid, text) {
    return this.connectionManager.sendText(chatJid, text);
  }

  async sendMessage(chatJid, content) {
    const sock = this.connectionManager.getSock();
    if (!sock) throw new Error('Socket not connected');
    return sock.sendMessage(chatJid, content);
  }

  async isGroupAdmin(chatJid, userJid) {
    return this.connectionManager.isGroupAdmin(chatJid, userJid);
  }

  getSock() {
    return this.connectionManager.getSock();
  }

  getConnectionState() {
    return this.connectionManager.getState();
  }

  getCommands() {
    return this.router ? this.router.getCommands() : [];
  }

  async start() {
    const commandRegistry = loadCommands();
    this.router = new Router(commandRegistry, this, this.services);

    events.on('message.new', (message) => {
      this.router.handleMessage(message).catch((err) => {
        logger.error('Router failed to handle message', { error: err.message });
      });
    });

    events.on('connection.state', (state) => {
      if (state === 'CONNECTED' && !this._startedAt) {
        this._startedAt = Date.now();
        this._ensureOwnerBootstrap();
      }
    });

    startApiServer(this.connectionManager);
    await this.connectionManager.start();
    this._registerGracefulShutdown();
  }

  /**
   * If nobody is registered as owner yet, the account the bot itself is
   * linked to (its own JID) auto-claims ownership. Without this, ADMIN_ONLY
   * commands like /settings and /story would be permanently unreachable —
   * there'd be no way for anyone to grant themselves access.
   */
  async _ensureOwnerBootstrap() {
    if (settingsRepo.getOwners().length > 0) return;
    const ownJids = this.ownJids;
    if (ownJids.length === 0) return;
    for (const jid of ownJids) {
      await settingsRepo.addOwner(jid);
    }
    logger.info('Bootstrapped bot owner from own linked account', { ownJids });
    console.log(`\n👑 تم تعيين حسابك كمالك افتراضي للبوت (أول تشغيل، لا يوجد مالك مسجل): ${ownJids.join(', ')}\n`);
  }

  _registerGracefulShutdown() {
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('Graceful shutdown initiated', { signal });
      console.log('\nShutting down STONX...');

      // 1. Stop accepting new work — router already ignores messages once we
      //    detach the listener.
      events.removeAllListeners('message.new');

      // 2. Let in-flight downloads finish or hit their own timeout
      //    (downloadQueue enforces JOB_TIMEOUT_MS per job already).
      const waitStart = Date.now();
      while (this.services.queue.active > 0 && Date.now() - waitStart < 10000) {
        await new Promise((r) => setTimeout(r, 200));
      }

      // 3/4/5/6. Close the WhatsApp connection (also clears timers/listeners).
      await this.connectionManager.shutdown();

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

module.exports = { Bot };
