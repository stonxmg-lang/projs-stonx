'use strict';

const { extractFirstUrl } = require('../utils/validation');
const { safeUnlink, humanFileSize } = require('../utils/files');

module.exports = {
  name: 'stond',
  description: 'تنزيل فيديو من رابط',
  async execute(context) {
    const { args, rawArgs, reply, services, bot, chat, message } = context;
    const url = args[0] || extractFirstUrl(rawArgs) || extractFirstUrl(require('../utils/media').getTextBody(message));

    if (!url) {
      await reply('الاستخدام: /stond <رابط الفيديو>');
      return;
    }

    await reply('⏳ جاري تنزيل الفيديو...');

    let result;
    try {
      result = await services.videoDownloader.downloadVideo(url);
    } catch (err) {
      await reply(mapDownloadError(err));
      return;
    }

    try {
      await bot.sendMessage(chat, { video: { url: result.filePath } });
      await reply(`✅ تم تنزيل الفيديو بنجاح.\n📦 الحجم: ${humanFileSize(result.sizeBytes)}`);
    } catch (err) {
      await reply('❌ تعذر إرسال الفيديو.');
    } finally {
      safeUnlink(result.filePath);
    }
  }
};

function mapDownloadError(err) {
  const msg = err?.message || '';
  if (msg === 'INVALID_URL') return '❌ الرابط غير صالح.';
  if (msg === 'QUEUE_FULL') return '❌ الخادم مشغول حاليًا بعدد كبير من التنزيلات، حاول لاحقًا.';
  if (msg === 'JOB_TIMEOUT') return '❌ استغرق التنزيل وقتًا طويلًا وتم إلغاؤه.';
  return '❌ تعذر تنزيل الفيديو.\n\nالسبب:\nالرابط غير صالح أو لم يتمكن الخادم من تنزيل المحتوى.';
}
