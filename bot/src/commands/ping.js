'use strict';

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

module.exports = {
  name: 'ping',
  description: 'اختبار حالة البوت',
  async execute(context) {
    const state = context.bot.getConnectionState();
    const connected = state === 'CONNECTED';
    const uptime = formatUptime(context.bot.uptimeMs);

    await context.reply(
      [
        '🏓 Pong!',
        '',
        `Bot: Online ✅`,
        `WhatsApp: ${connected ? 'Connected ✅' : 'Reconnecting ⚠️'}`,
        `Uptime: ${uptime}`
      ].join('\n')
    );
  }
};
