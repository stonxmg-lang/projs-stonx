'use strict';

const { JsonCollection } = require('./database');
const config = require('../config');

const DEFAULTS = {
  global: {
    botAccess: config.BOT_ACCESS.PUBLIC,
    chatScope: config.CHAT_SCOPE.ALL,
    allowedUsers: [],
    blockedUsers: [],
    allowedChats: [],
    blockedChats: [],
    // The WhatsApp Channel (newsletter) JID that /story channel posts to.
    // Set via /settings channel <jid>; null until configured.
    channelJid: null,
    // Per-command policy: 'ALL' | 'ADMIN_ONLY' | 'DISABLED'
    commandPermissions: {
      menu: 'ALL',
      ping: 'ALL',
      settings: 'ADMIN_ONLY',
      stond: 'ALL',
      song: 'ALL',
      story: 'ADMIN_ONLY',
      male: 'ALL'
    }
  },
  // Per-chat overrides, keyed by chat JID. Same shape as commandPermissions subset.
  chats: {},
  // Per-user preferences, keyed by user JID.
  users: {},
  owners: []
};

const store = new JsonCollection('settings', DEFAULTS);

function getGlobal() {
  const data = store.read();
  return data.global;
}

function updateGlobal(patch) {
  const data = store.read();
  data.global = { ...data.global, ...patch };
  return store.write(data);
}

function getCommandPermission(commandName, chatJid) {
  const data = store.read();
  const chatOverride = chatJid && data.chats[chatJid]?.commandPermissions?.[commandName];
  if (chatOverride) return chatOverride;
  return data.global.commandPermissions[commandName] || 'ALL';
}

function setCommandPermission(commandName, level, chatJid) {
  const data = store.read();
  if (chatJid) {
    data.chats[chatJid] = data.chats[chatJid] || {};
    data.chats[chatJid].commandPermissions = data.chats[chatJid].commandPermissions || {};
    data.chats[chatJid].commandPermissions[commandName] = level;
  } else {
    data.global.commandPermissions[commandName] = level;
  }
  return store.write(data);
}

function getChatSettings(chatJid) {
  const data = store.read();
  return data.chats[chatJid] || {};
}

function setChatSettings(chatJid, patch) {
  const data = store.read();
  data.chats[chatJid] = { ...(data.chats[chatJid] || {}), ...patch };
  return store.write(data);
}

function isOwner(userJid) {
  return store.read().owners.includes(userJid);
}

function getOwners() {
  return store.read().owners;
}

function addOwner(userJid) {
  const data = store.read();
  if (!data.owners.includes(userJid)) data.owners.push(userJid);
  return store.write(data);
}

module.exports = {
  getGlobal,
  updateGlobal,
  getCommandPermission,
  setCommandPermission,
  getChatSettings,
  setChatSettings,
  isOwner,
  getOwners,
  addOwner
};
