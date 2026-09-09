'use strict';

const accessPolicy = require('./accessPolicy');
const commandPolicy = require('./commandPolicy');
const settings = require('../database/settings');

/**
 * @param {object} context  Command context (see core/command.js for shape)
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkAccess(context) {
  return accessPolicy.checkAccess({
    userJid: context.sender,
    chatJid: context.chat,
    chatType: context.chatType
  });
}

/**
 * @param {string} commandName
 * @param {object} context
 */
function checkCommand(commandName, context) {
  return commandPolicy.checkCommand(commandName, {
    userJid: context.sender,
    chatJid: context.chat,
    isOwner: settings.isOwner(context.sender),
    isGroupAdmin: context.isGroupAdmin === true
  });
}

/** Full check used by the router before dispatch: bot access, then command policy. */
function canRun(commandName, context) {
  const access = checkAccess(context);
  if (!access.allowed) return access;
  return checkCommand(commandName, context);
}

/** Filters a command list down to what this user may currently run (used by /menu). */
function filterAvailableCommands(commandNames, context) {
  return commandNames.filter((name) => canRun(name, context).allowed);
}

module.exports = { checkAccess, checkCommand, canRun, filterAvailableCommands };
