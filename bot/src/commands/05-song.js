'use strict';

const { extractFirstUrl } = require('../utils/validation');
const { safeUnlink, humanFileSize } = require('../utils/files');
const { getTextBody } = require('../utils/media');

module.exports = {
  name: 'song',
  description: 'استخراج/تنزيل صوت من رابط أو من فيديو مرفق',
  async execute(context) {
    const { args, rawArgs, message, reply, services, bot, chat } = context;
    const url = args[0] || extractFirstUrl(rawArgs) || extractFirstUrl(getTextBody(message));

    if (url) {
      await handleUrlCase(url, { reply, services, bot, chat });
      return;
    }

    if (context.attachedMediaType === 'video') {
      await handleAttachedVideoCase(message, { reply, services, bot, chat });
      return;
    }

    await reply('الاستخدام: /song <رابط> — أو أرسل فيديو وضع "/song" كتعليق عليه.');
  }
};

async function handleUrlCase(url, { reply, services, bot, chat }) {
  await reply('⏳ جاري استخراج الصوت...');

  let result;
  try {
    result = await services.audioDownloader.downloadAudio(url);
  } catch (err) {
    await reply(mapError(err));
    return;
  }

  try {
    await bot.sendMessage(chat, { audio: { url: result.filePath }, mimetype: 'audio/mpeg' });
    await reply(`✅ تم استخراج الصوت بنجاح.\n📦 الحجم: ${humanFileSize(result.sizeBytes)}`);
  } catch (_) {
    await reply('❌ تعذر إرسال الصوت.');
  } finally {
    safeUnlink(result.filePath);
  }
}

async function handleAttachedVideoCase(message, { reply, services, bot, chat }) {
  await reply('⏳ جاري استخراج الصوت من الفيديو...');

  const videoPath = await services.whatsappMedia.downloadMessageMediaSafe(message, 'mp4');
  if (!videoPath) {
    await reply('❌ تعذر تنزيل الفيديو المرفق.');
    return;
  }

  let result;
  try {
    result = await services.audioExtractor.extractAudio(videoPath);
  } catch (_) {
    await reply('❌ تعذر استخراج الصوت من الفيديو.');
    safeUnlink(videoPath);
    return;
  }

  try {
    await bot.sendMessage(chat, { audio: { url: result.filePath }, mimetype: 'audio/mpeg' });
    await reply(`✅ تم استخراج الصوت بنجاح.\n📦 الحجم: ${humanFileSize(result.sizeBytes)}`);
  } catch (_) {
    await reply('❌ تعذر إرسال الصوت.');
  } finally {
    safeUnlink(videoPath);
    safeUnlink(result.filePath);
  }
}

function mapError(err) {
  const msg = err?.message || '';
  if (msg === 'INVALID_URL') return '❌ الرابط غير صالح.';
  if (msg === 'QUEUE_FULL') return '❌ الخادم مشغول حاليًا، حاول لاحقًا.';
  if (msg === 'JOB_TIMEOUT') return '❌ استغرقت العملية وقتًا طويلًا وتم إلغاؤها.';
  if (msg === 'NO_DOWNLOADER_FOR_PLATFORM') return '❌ هذا الرابط من منصة غير مدعومة على هذا الإصدار (المُنزّل الداخلي يدعم يوتيوب فقط).';
  return '❌ تعذر استخراج الصوت.\n\nالسبب:\nالرابط غير صالح أو لم يتمكن الخادم من معالجة المحتوى.';
}
