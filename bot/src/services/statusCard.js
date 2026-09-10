'use strict';

const { toMonospaceFont } = require('../utils/textStyle');
const pkg = require('../../package.json');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Same "fancy monospace" card style already used by /menu's info box —
 * sent to the bot's own chat every time it comes online (a fresh pairing,
 * or any later reconnect) so the owner has a clear, timestamped signal the
 * bot is actually up and which build it's running.
 */
function buildOnlineStatusCard() {
  const now = new Date();
  const day = WEEKDAYS[now.getDay()];
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const name = pkg.name.toUpperCase();

  return [
    `╭── ${toMonospaceFont('INFORMATION')} ───`,
    `│ ${toMonospaceFont('Name')} : ${toMonospaceFont(name)}`,
    `│ ${toMonospaceFont('Status')} : ${toMonospaceFont('ONLINE')}`,
    `│ ${toMonospaceFont('Version')} : ${toMonospaceFont(pkg.version)}`,
    `│ ${toMonospaceFont('Day')} : ${toMonospaceFont(day)}`,
    `│ ${toMonospaceFont('Date')} : ${toMonospaceFont(date)}`,
    `│ ${toMonospaceFont('Time')} : ${toMonospaceFont(time)}`,
    `│ ${toMonospaceFont('System')} : ${toMonospaceFont('BOOT OK')}`,
    '────────────────╰',
    toMonospaceFont(`${name} is ready.`)
  ].join('\n');
}

module.exports = { buildOnlineStatusCard };
