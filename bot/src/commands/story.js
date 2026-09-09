'use strict';

const config = require('../config');
const { safeUnlink } = require('../utils/files');
const { detectMediaType, getTextBody } = require('../utils/media');

const DEFAULT_STORY_BACKGROUND = '#808080'; // gray, used for text-only stories
const MEDIA_EXTENSIONS = { image: 'jpg', video: 'mp4', audio: 'ogg' };

// The story's source can be media attached directly to the /story command
// itself (e.g. an image sent with caption "/story hi") or the message being
// replied to. The direct attachment takes priority.
function extractSource(context) {
  const { message, quotedMessage } = context;
  const attachedType = context.attachedMediaType;
  if (attachedType === 'image' || attachedType === 'video' || attachedType === 'audio') {
    return { rawMessage: message, type: attachedType };
  }
  if (quotedMessage) {
    return { rawMessage: { message: quotedMessage.message }, type: detectMediaType({ message: quotedMessage.message }) };
  }
  return null;
}

module.exports = {
  name: 'story',
  description: 'نشر صورة/فيديو/صوت/نص كـ WhatsApp Story، أو "/story channel" للنشر على قناة واتساب المحددة',
  async execute(context) {
    const { quotedMessage, reply, services, bot, chat, rawArgs, args, database } = context;

    if ((args[0] || '').toLowerCase() === 'channel') {
      // Publishing to a public channel is more sensitive than a group
      // status, so it's gated to the bot owner regardless of the general
      // /story command permission level — same reasoning as /male's
      // broadcast modes and /settings addowner.
      if (!database.settings.isOwner(context.sender)) {
        await reply('❌ النشر على القناة متاح فقط لمالك البوت.');
        return;
      }

      const channelJid = database.settings.getGlobal().channelJid;
      if (!channelJid) {
        await reply('❌ لسه محددتش القناة. استخدم: /settings channel <jid>');
        return;
      }

      const channelArgs = rawArgs.replace(/^channel\s*/i, '').trim();
      const source = extractSource(context);

      if (source && (source.type === 'image' || source.type === 'video' || source.type === 'audio')) {
        const ownCaption = channelArgs;
        const mediaCaption = getTextBody(source.rawMessage);
        const caption = ownCaption || mediaCaption || undefined;

        const extension = MEDIA_EXTENSIONS[source.type];
        const filePath = await services.whatsappMedia.downloadMessageMediaSafe(source.rawMessage, extension);

        if (!filePath) {
          await reply('❌ تعذر تنزيل الوسائط المشار إليها.');
          return;
        }

        try {
          await services.storyService.postToChannel(bot, { type: source.type, filePath, caption }, channelJid);
          // Success is silent by design — only failures are reported.
        } catch (err) {
          await reply(err.userMessage || '❌ تعذر النشر على القناة.');
        } finally {
          safeUnlink(filePath);
        }
        return;
      }

      const quotedText = quotedMessage ? getTextBody({ message: quotedMessage.message }) : '';
      const text = channelArgs || quotedText;

      if (!text) {
        await reply('❌ يجب الرد على صورة/فيديو/صوت/نص، أو إرفاق الوسائط، أو كتابة نص بعد channel.');
        return;
      }

      try {
        await services.storyService.postToChannel(bot, { type: 'text', text }, channelJid);
        // Success is silent by design — only failures are reported.
      } catch (err) {
        await reply(err.userMessage || '❌ تعذر النشر على القناة.');
      }
      return;
    }

    // --- existing group-status behavior ---
    if (context.chatType !== config.CHAT_TYPE.GROUP) {
      await reply('❌ هذا الأمر يعمل فقط داخل الجروبات (أو استخدم /story channel للنشر على القناة).');
      return;
    }

    const source = extractSource(context);

    if (source && (source.type === 'image' || source.type === 'video' || source.type === 'audio')) {
      const ownCaption = rawArgs.trim();
      const mediaCaption = getTextBody(source.rawMessage);
      const caption = ownCaption || mediaCaption || undefined;

      const extension = MEDIA_EXTENSIONS[source.type];
      const filePath = await services.whatsappMedia.downloadMessageMediaSafe(source.rawMessage, extension);

      if (!filePath) {
        await reply('❌ تعذر تنزيل الوسائط المشار إليها.');
        return;
      }

      try {
        // Group Status: passing the group's own JID posts it as that
        // group's shared status, visible to its members.
        await services.storyService.postStory(
          bot.getSock(),
          { type: source.type, filePath, caption },
          [chat]
        );
        // Success is silent by design — only failures are reported.
      } catch (err) {
        await reply(err.userMessage || '❌ تعذر نشر الـStory.');
      } finally {
        safeUnlink(filePath);
      }
      return;
    }

    const quotedText = quotedMessage ? getTextBody({ message: quotedMessage.message }) : '';
    const text = rawArgs.trim() || quotedText;

    if (!text) {
      await reply('❌ يجب الرد على صورة/فيديو/صوت/نص، أو إرفاق الوسائط مع الأمر.');
      return;
    }

    try {
      await services.storyService.postStory(
        bot.getSock(),
        { type: 'text', text, backgroundColor: DEFAULT_STORY_BACKGROUND },
        [chat]
      );
      // Success is silent by design — only failures are reported.
    } catch (err) {
      await reply(err.userMessage || '❌ تعذر نشر الـStory.');
    }
  }
};
