'use strict';

const { JsonCollection } = require('./database');

const store = new JsonCollection('chats', { chats: {} });

function upsert(jid, patch = {}) {
  const data = store.read();
  const existing = data.chats[jid] || { jid, firstSeen: Date.now() };
  data.chats[jid] = { ...existing, ...patch, lastSeen: Date.now() };
  store.write(data);
  return data.chats[jid];
}

function get(jid) {
  return store.read().chats[jid] || null;
}

function all() {
  return Object.values(store.read().chats);
}

function allGroups() {
  return all().filter((c) => c.type === 'GROUP');
}

function allPrivate() {
  return all().filter((c) => c.type === 'PRIVATE');
}

module.exports = { upsert, get, all, allGroups, allPrivate };
