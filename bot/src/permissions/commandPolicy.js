'use strict';

const settings = require('../database/settings');

/**
 * @param {string} commandName
 * @param {{ userJid: string, chatJid: string, isOwner: boolean, isGroupAdmin: boolean }} ctx
 */
function checkCommand(commandName, { userJid, chatJid, isOwner, isGroupAdmin }) {
  const level = settings.getCommandPermission(commandName, chatJid);

  if (level === 'DISABLED') {
    if (isOwner) return { allowed: true };
    return { allowed: false, reason: 'COMMAND_DISABLED' };
  }

  if (level === 'ADMIN_ONLY') {
    if (isOwner || isGroupAdmin) return { allowed: true };
    return { allowed: false, reason: 'COMMAND_ADMIN_ONLY' };
  }

  // 'ALL'
  return { allowed: true };
}

module.exports = { checkCommand };
