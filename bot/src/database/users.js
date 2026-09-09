'use strict';

const { JsonCollection } = require('./database');

const store = new JsonCollection('users', { users: {} });

function upsert(jid, patch = {}) {
  const data = store.read();
  const existing = data.users[jid] || { jid, firstSeen: Date.now() };
  data.users[jid] = { ...existing, ...patch, lastSeen: Date.now() };
  store.write(data);
  return data.users[jid];
}

function get(jid) {
  return store.read().users[jid] || null;
}

function all() {
  return Object.values(store.read().users);
}

module.exports = { upsert, get, all };
