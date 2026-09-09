'use strict';

const config = require('../config');
const settings = require('../database/settings');

/**
 * @param {{ userJid: string, chatJid: string, chatType: 'PRIVATE'|'GROUP'|'SELF' }} ctx
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkAccess({ userJid, chatJid, chatType }) {
  const g = settings.getGlobal();

  // --- Bot access level ---
  if (g.botAccess === config.BOT_ACCESS.DISABLED) {
    if (!settings.isOwner(userJid)) {
      return { allowed: false, reason: 'BOT_DISABLED' };
    }
  } else if (g.botAccess === config.BOT_ACCESS.WHITELIST) {
    if (!settings.isOwner(userJid) && !g.allowedUsers.includes(userJid)) {
      return { allowed: false, reason: 'NOT_WHITELISTED' };
    }
  } else if (g.botAccess === config.BOT_ACCESS.PUBLIC_WITH_BLACKLIST) {
    if (g.blockedUsers.includes(userJid)) {
      return { allowed: false, reason: 'BLACKLISTED' };
    }
  }
  // PUBLIC: no user-level restriction.

  // --- Chat scope ---
  const scope = g.chatScope;
  if (scope === config.CHAT_SCOPE.PRIVATE_ONLY && chatType !== 'PRIVATE') {
    return { allowed: false, reason: 'CHAT_SCOPE_PRIVATE_ONLY' };
  }
  if (scope === config.CHAT_SCOPE.GROUPS_ONLY && chatType !== 'GROUP') {
    return { allowed: false, reason: 'CHAT_SCOPE_GROUPS_ONLY' };
  }
  if (scope === config.CHAT_SCOPE.ALLOWED_CHATS && !g.allowedChats.includes(chatJid)) {
    return { allowed: false, reason: 'CHAT_NOT_ALLOWED' };
  }
  if (scope === config.CHAT_SCOPE.ALL_EXCEPT && g.blockedChats.includes(chatJid)) {
    return { allowed: false, reason: 'CHAT_BLOCKED' };
  }

  return { allowed: true };
}

module.exports = { checkAccess };
