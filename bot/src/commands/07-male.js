'use strict';

const config = require('../config');

const MODE_ALIASES = {
  all: config.MALE_TARGET.ALL,
  groups: config.MALE_TARGET.GROUPS_ONLY,
  users: config.MALE_TARGET.USERS_ONLY,
  self: config.MALE_TARGET.SELF_CHAT
};

module.exports = {
  name: 'male',
  description: 'إرسال رسالة صوتية محفوظة (صلوات)',
  async execute(context) {
    const { args, reply, services, bot, chat, sender, database } = context;

    const requestedMode = args[0] ? MODE_ALIASES[args[0].toLowerCase()] : null;
    const mode = requestedMode || config.MALE_TARGET.CURRENT_CHAT;

    // Broadcast-style targets are gated to the owner regardless of the
    // general command-permission level, so /male being ALL for everyone
    // never turns into an open broadcast tool.
    const isBroadcast = mode !== config.MALE_TARGET.CURRENT_CHAT && mode !== config.MALE_TARGET.SELF_CHAT;
    if (isBroadcast && !database.settings.isOwner(sender)) {
      await reply('❌ هذا الوضع (Broadcast) متاح فقط للمالك.');
      return;
    }

    const targets = services.targetResolver.resolveTargets(mode, { chat, sender, bot });
    if (targets.length === 0) {
      await reply('❌ لا توجد وجهات مطابقة لإرسال الرسالة الصوتية.');
      return;
    }

    const sock = bot.getSock();
    let sent = 0;
    let failed = 0;
    for (const targetJid of targets) {
      try {
        await services.voiceService.sendVoiceMessage(sock, targetJid);
        sent++;
      } catch (err) {
        failed++;
      }
    }

    if (targets.length === 1) {
      if (sent !== 1) {
        await reply('❌ تعذر إرسال الرسالة الصوتية.');
      }
      // Success is silent by design — only failures are reported.
    } else if (sent === 0) {
      await reply('❌ تعذر إرسال الرسالة الصوتية لأي وجهة.');
    } else if (failed > 0) {
      await reply(`⚠️ تم الإرسال إلى ${sent} من ${targets.length} (فشل: ${failed}).`);
    }
    // Full success across all targets is silent by design.
  }
};
