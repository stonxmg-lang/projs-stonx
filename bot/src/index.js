'use strict';

const dependencyChecker = require('./utils/dependencyChecker');
const logger = require('./utils/logger');
const { Bot } = require('./core/bot');

async function main() {
  const depsOk = dependencyChecker.checkAll();
  if (!depsOk) {
    console.log('يرجى تثبيت المتطلبات الناقصة أعلاه ثم إعادة المحاولة.');
    process.exit(1);
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
