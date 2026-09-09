'use strict';

const dependencyChecker = require('./utils/dependencyChecker');
const logger = require('./utils/logger');
const { Bot } = require('./core/bot');

async function main() {
  const depsOk = dependencyChecker.checkAll();
  if (!depsOk) {
    // On the standalone Android APK build, external CLI tools like ffmpeg
    // and yt-dlp aren't available (and nodejs-mobile can't spawn them
    // anyway). We DON'T abort here — the bot still connects to WhatsApp and
    // every command that doesn't rely on those tools works normally. Only
    // the audio/video download features will be unavailable.
    console.log('⚠️ بعض الأدوات الخارجية ناقصة — هيتم تشغيل البوت بدون ميزات التحميل/التحويل.');
  }

  const bot = new Bot();

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: reason?.message || String(reason) });
  });

  await bot.start();
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  console.error('❌ فشل بدء تشغيل STONX. راجع data/logs/stonx.log للتفاصيل.');
  process.exit(1);
});
