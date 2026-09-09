'use strict';

const config = require('../config');
const logger = require('../utils/logger');
const media = require('../utils/media');
const permissionManager = require('../permissions/permissionManager');
const usersRepo = require('../database/users');
const chatsRepo = require('../database/chats');
const settingsRepo = require('../database/settings');

function resolveChatType(chatJid, senderJid, ownJids) {
  if (chatJid.endsWith('@g.us')) return config.CHAT_TYPE.GROUP;
  if (Array.isArray(ownJids) && ownJids.includes(chatJid) && ownJids.includes(senderJid)) {
    return config.CHAT_TYPE.SELF;
  }
  return config.CHAT_TYPE.PRIVATE;
}

function parseCommand(text) {
  if (!text || !text.startsWith(config.COMMAND_PREFIX)) return null;
  const withoutPrefix = text.slice(config.COMMAND_PREFIX.length);
  const [name, ...rest] = withoutPrefix.trim().split(/\s+/);
  if (!name) return null;
  return { name: name.toLowerCase(), args: rest, rawArgs: rest.join(' ') };
}

function mapCommandDenialMessage(reason) {
  if (reason === 'COMMAND_ADMIN_ONLY') return '❌ هذا الأمر متاح فقط لمالك البوت أو مدراء المجموعة.';
  if (reason === 'COMMAND_DISABLED') return '❌ هذا الأمر مُعطَّل حاليًا.';
  return '❌ لا تملك صلاحية تنفيذ هذا الأمر.';
}

class Router {
  /**
   * @param {Map<string, object>} commandRegistry
   * @param {object} bot - the bot facade (send/reply helpers, sock access, isGroupAdmin, ownJid)
   * @param {object} services - injected service instances shared across commands
   */
  constructor(commandRegistry, bot, services) {
    this.commands = commandRegistry;
    this.bot = bot;
    this.services = services;
  }

  getCommandNames() {
    return Array.from(this.commands.keys());
  }

  getCommands() {
    return Array.from(this.commands.values()).map((c) => ({
      name: c.name,
      description: c.description,
      // Optional: a command may declare which chat types it can actually run
      // in (e.g. ['GROUP']). Undefined means "all chat types". /menu uses
      // this to hide commands that would just fail where they're called.
      allowedChatTypes: c.allowedChatTypes
    }));
  }

  async handleMessage(rawMessage) {
    try {
      await this._dispatch(rawMessage);
    } catch (err) {
      logger.error('Unhandled error while dispatching message', { error: err.message, stack: err.stack });
    }
  }

  async _dispatch(rawMessage) {
    const chatJid = rawMessage.key.remoteJid;
    if (!chatJid) return;

    // fromMe messages are sent by the bot's own linked account — including
    // from any other device linked to the same account, in any chat (a
    // group, someone's DM, or self-chat). Only the account owner can ever
    // produce fromMe:true, so we don't restrict it to self-chat: the
    // parseCommand() gate right below already ignores anything that isn't a
    // recognized "/command", and our own sent replies never start with "/",
    // so processing fromMe here carries no risk of an echo loop.
    const ownJids = this.bot.ownJids || [];

    // Groups always set key.participant (even for our own fromMe messages),
    // so it's reliable there. Private chats never set it — and for a
    // fromMe message in a private chat, key.remoteJid is the *other*
    // party, not us, so falling back to that would misattribute an
    // owner-sent command to whoever they're chatting with. Use our own
    // identity instead in that case.
    const senderJid = rawMessage.key.participant
      || (rawMessage.key.fromMe ? (ownJids[0] || chatJid) : chatJid);

    const text = media.getTextBody(rawMessage);
    const parsed = parseCommand(text);
    if (!parsed) return; // not a command - silently ignore per spec (section 29)

    const chatType = resolveChatType(chatJid, senderJid, ownJids);

    usersRepo.upsert(senderJid);
    chatsRepo.upsert(chatJid, { type: chatType });

    const command = this.commands.get(parsed.name);
    if (!command) return; // unknown command - stay quiet, avoid noise (section 30)

    const quoted = media.getQuotedMessage(rawMessage);
    const isGroupAdmin = chatType === config.CHAT_TYPE.GROUP
      ? await this.bot.isGroupAdmin(chatJid, senderJid).catch(() => false)
      : false;

    const context = {
      message: rawMessage,
      sender: senderJid,
      chat: chatJid,
      chatType,
      quotedMessage: quoted,
      attachedMediaType: media.detectMediaType(rawMessage),
      args: parsed.args,
      rawArgs: parsed.rawArgs,
      command: parsed.name,
      isGroupAdmin,
      bot: this.bot,
      database: { users: usersRepo, chats: chatsRepo, settings: settingsRepo },
      services: this.services,
      permissions: permissionManager,
      reply: (content) => this.bot.sendText(chatJid, content, rawMessage)
    };

    const accessCheck = permissionManager.checkAccess(context);
    if (!accessCheck.allowed) {
      // Silent on purpose: this is the bot-wide access gate (blacklist,
      // chat scope, etc). Replying here would confirm the bot's existence
      // to someone it's specifically configured to ignore.
      logger.debug('Access denied', { sender: senderJid, chat: chatJid, reason: accessCheck.reason });
      return;
    }

    const commandCheck = permissionManager.checkCommand(parsed.name, context);
    if (!commandCheck.allowed) {
      // Not silent: the user clearly already has general access to the bot
      // (they passed checkAccess above), so telling them this specific
      // command needs admin/owner rights isn't a security leak — it's just
      // honest, and staying silent here reads as the bot being broken.
      logger.debug('Command denied', { sender: senderJid, command: parsed.name, reason: commandCheck.reason });
      await context.reply(mapCommandDenialMessage(commandCheck.reason)).catch(() => {});
      return;
    }

    logger.info('Executing command', { command: parsed.name, chat: chatJid, sender: senderJid });

    try {
      await command.execute(context);
    } catch (err) {
      logger.error('Command execution failed', { command: parsed.name, error: err.message, stack: err.stack });
      await context.reply('❌ حدث خطأ أثناء تنفيذ الأمر.').catch(() => {});
    }
  }
}

module.exports = { Router, parseCommand, resolveChatType };
