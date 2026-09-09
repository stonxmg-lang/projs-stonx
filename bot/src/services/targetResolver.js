'use strict';

const config = require('../config');
const chatsRepo = require('../database/chats');
const accessPolicy = require('../permissions/accessPolicy');

function chatPassesAccess(chat) {
  const check = accessPolicy.checkAccess({
    userJid: chat.jid, // best-effort: chat-level checks care mainly about chatType/jid here
    chatJid: chat.jid,
    chatType: chat.type
  });
  return check.allowed;
}

/**
 * @param {string} mode - one of config.MALE_TARGET
 * @param {{ chat: string, sender: string, bot: object, selectedTargets?: string[] }} context
 * @returns {string[]} resolved JIDs
 */
function resolveTargets(mode, context) {
  switch (mode) {
    case config.MALE_TARGET.CURRENT_CHAT:
      return [context.chat];

    case config.MALE_TARGET.SELF_CHAT:
      return context.bot.ownJid ? [context.bot.ownJid] : [];

    case config.MALE_TARGET.GROUPS_ONLY:
      return chatsRepo.allGroups().filter(chatPassesAccess).map((c) => c.jid);

    case config.MALE_TARGET.USERS_ONLY:
      return chatsRepo.allPrivate().filter(chatPassesAccess).map((c) => c.jid);

    case config.MALE_TARGET.ALL:
      return chatsRepo.all().filter(chatPassesAccess).map((c) => c.jid);

    case config.MALE_TARGET.SELECTED:
      return Array.isArray(context.selectedTargets) ? context.selectedTargets : [];

    default:
      return [];
  }
}

module.exports = { resolveTargets };
