'use strict';

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

const dependencyChecker = require('./utils/dependencyChecker');
const logger = require('./utils/logger');
const { Bot } = require('./core/bot');

async function main() {
  const depsOk = dependencyChecker.checkAll();
  if (!depsOk) {
    // On the standalone Android APK build, the external CLI tools ffmpeg
    // and yt-dlp aren't available (nodejs-mobile has no shell to spawn
    // them from). We DON'T abort here — the bot still connects to
    // WhatsApp, and download/audio features fall back to pure-JS engines
    // (ffmpeg.wasm for audio/video encoding, @distube/ytdl-core for
    // YouTube links specifically) instead of being disabled outright. The
    // one real gap: yt-dlp's broad multi-platform support has no
    // equivalent pure-JS replacement, so non-YouTube links still fail with
    // a clear "unsupported platform" message on that build.
    console.log('⚠️ بعض الأدوات الخارجية (ffmpeg/yt-dlp) ناقصة — هيتم استخدام البدائل الداخلية (ffmpeg.wasm + ytdl-core ليوتيوب فقط) بدل التعطيل الكامل.');
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
