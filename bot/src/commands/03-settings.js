'use strict';

const config = require('../config');

const HELP = [
  '⚙️ *STONX Settings*',
  '',
  '/settings                       — عرض الإعدادات الحالية',
  '/settings access <PUBLIC|WHITELIST|PUBLIC_WITH_BLACKLIST|DISABLED>',
  '/settings scope <PRIVATE_ONLY|GROUPS_ONLY|ALL|ALLOWED_CHATS|ALL_EXCEPT>',
  '/settings allowuser <jid>',
  '/settings blockuser <jid>',
  '/settings allowchat <jid>',
  '/settings blockchat <jid>',
  '/settings command <name> <ALL|ADMIN_ONLY|DISABLED> [here]',
  '/settings channel <jid>    (owners only — sets the /story channel target)',
  '/settings addowner <jid>   (owners only)'
].join('\n');

function renderCurrent(g, chatJid, settingsDb) {
  const chatOverrides = settingsDb.getChatSettings(chatJid).commandPermissions || {};
  const commandLines = Object.entries(g.commandPermissions)
    .map(([name, level]) => `  /${name}: ${chatOverrides[name] || level}${chatOverrides[name] ? ' (override هنا)' : ''}`)
    .join('\n');

  return [
    '📊 *الإعدادات الحالية*',
    '',
    `Bot Access: ${g.botAccess}`,
    `Chat Scope: ${g.chatScope}`,
    `Allowed users: ${g.allowedUsers.length}`,
    `Blocked users: ${g.blockedUsers.length}`,
    `Allowed chats: ${g.allowedChats.length}`,
    `Blocked chats: ${g.blockedChats.length}`,
    `Story channel: ${g.channelJid || '(غير محدد)'}`,
    '',
    'Command Permissions:',
    commandLines
  ].join('\n');
}

module.exports = {
  name: 'settings',
  description: 'إدارة صلاحيات واستخدام البوت',
  async execute(context) {
    const { args, database, chat, reply } = context;
    const settingsDb = database.settings;
    const g = settingsDb.getGlobal();

    if (args.length === 0) {
      await reply(renderCurrent(g, chat, settingsDb));
      return;
    }

    const sub = args[0].toLowerCase();

    if (sub === 'help') {
      await reply(HELP);
      return;
    }

    if (sub === 'access') {
      const value = (args[1] || '').toUpperCase();
      if (!Object.values(config.BOT_ACCESS).includes(value)) {
        await reply(`❌ قيمة غير صالحة. الخيارات: ${Object.values(config.BOT_ACCESS).join(', ')}`);
        return;
      }
      await settingsDb.updateGlobal({ botAccess: value });
      await reply(`✅ تم تعيين Bot Access إلى ${value}`);
      return;
    }

    if (sub === 'scope') {
      const value = (args[1] || '').toUpperCase();
      if (!Object.values(config.CHAT_SCOPE).includes(value)) {
        await reply(`❌ قيمة غير صالحة. الخيارات: ${Object.values(config.CHAT_SCOPE).join(', ')}`);
        return;
      }
      await settingsDb.updateGlobal({ chatScope: value });
      await reply(`✅ تم تعيين Chat Scope إلى ${value}`);
      return;
    }

    if (sub === 'allowuser' || sub === 'blockuser') {
      const jid = args[1];
      if (!jid) {
        await reply('❌ حدد JID المستخدم.');
        return;
      }
      const key = sub === 'allowuser' ? 'allowedUsers' : 'blockedUsers';
      const list = new Set(g[key]);
      list.add(jid);
      await settingsDb.updateGlobal({ [key]: Array.from(list) });
      await reply(`✅ تمت إضافة ${jid} إلى ${key}`);
      return;
    }

    if (sub === 'allowchat' || sub === 'blockchat') {
      const jid = args[1];
      if (!jid) {
        await reply('❌ حدد JID المحادثة.');
        return;
      }
      const key = sub === 'allowchat' ? 'allowedChats' : 'blockedChats';
      const list = new Set(g[key]);
      list.add(jid);
      await settingsDb.updateGlobal({ [key]: Array.from(list) });
      await reply(`✅ تمت إضافة ${jid} إلى ${key}`);
      return;
    }

    if (sub === 'command') {
      const cmdName = args[1];
      const level = (args[2] || '').toUpperCase();
      const scopeHere = args[3] === 'here';
      if (!cmdName || !['ALL', 'ADMIN_ONLY', 'DISABLED'].includes(level)) {
        await reply('❌ الصيغة: /settings command <name> <ALL|ADMIN_ONLY|DISABLED> [here]');
        return;
      }
      await settingsDb.setCommandPermission(cmdName, level, scopeHere ? chat : undefined);
      await reply(`✅ تم تعيين صلاحية /${cmdName} إلى ${level}${scopeHere ? ' (لهذه المحادثة فقط)' : ' (عام)'}`);
      return;
    }

    if (sub === 'channel') {
      // Same reasoning as addowner: /settings itself may be ADMIN_ONLY, but
      // pointing /story's channel-post feature at an arbitrary JID is more
      // sensitive than ordinary settings, so it's owner-gated inline.
      if (!settingsDb.isOwner(context.sender)) {
        await reply('❌ هذا الأمر متاح فقط لمالكي البوت الحاليين.');
        return;
      }
      const jid = args[1];
      if (!jid) {
        await reply(`📡 القناة الحالية: ${g.channelJid || '(غير محدد)'}`);
        return;
      }
      await settingsDb.updateGlobal({ channelJid: jid });
      await reply(`✅ تم تعيين قناة الـ /story إلى ${jid}`);
      return;
    }

    if (sub === 'addowner') {
      // Gated stricter than the rest of /settings: a group admin can run
      // /settings (ADMIN_ONLY), but only an existing owner may create a new
      // one — otherwise any group admin could grant themselves global
      // bot-owner rights.
      if (!settingsDb.isOwner(context.sender)) {
        await reply('❌ هذا الأمر متاح فقط لمالكي البوت الحاليين.');
        return;
      }
      const jid = args[1];
      if (!jid) {
        await reply('❌ حدد JID المستخدم.');
        return;
      }
      await settingsDb.addOwner(jid);
      await reply(`✅ تمت إضافة ${jid} كمالك للبوت.`);
      return;
    }

    await reply(HELP);
  }
};
