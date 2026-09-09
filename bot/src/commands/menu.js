'use strict';

const { toMonospaceFont } = require('../utils/textStyle');
const pkg = require('../../package.json');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildInfoBox() {
  const now = new Date();
  const day = WEEKDAYS[now.getDay()];
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const name = pkg.name.toUpperCase();
  const version = pkg.version;

  return [
    `╭── ${toMonospaceFont('INFORMATION')} ───`,
    `│ ${toMonospaceFont('Name')} : ${toMonospaceFont(name)}`,
    `│ ${toMonospaceFont('Day')}: ${toMonospaceFont(day)}`,
    `│ ${toMonospaceFont('Date')}: ${toMonospaceFont(date)}`,
    `│ ${toMonospaceFont('Version')}: ${toMonospaceFont(version)}`,
    '────────────────╰'
  ].join('\n');
}

function buildCommandsBox(visibleCommands) {
  const lines = visibleCommands.map((c, i) => `│${toMonospaceFont(pad2(i + 1))}· ${toMonospaceFont(c.name)}`);
  return [
    `╭──── ${toMonospaceFont('COMMANDS')} ────`,
    ...lines,
    '────────────────╰'
  ].join('\n');
}

module.exports = {
  name: 'menu',
  description: 'عرض قائمة الأوامر المتاحة',
  async execute(context) {
    const allCommands = context.bot.getCommands(); // [{name, description, allowedChatTypes?}]
    const allowedNames = context.permissions.filterAvailableCommands(
      allCommands.map((c) => c.name),
      context
    );

    // A command that only works in a specific chat type (e.g. /story only
    // runs inside groups) shouldn't be listed when it can't actually run —
    // otherwise the menu advertises commands that just error out. This is
    // driven entirely by each command's own `allowedChatTypes` field, so it
    // works automatically for /story here and for any future command too.
    const visibleCommands = allCommands.filter((c) => {
      if (!allowedNames.includes(c.name)) return false;
      if (Array.isArray(c.allowedChatTypes) && !c.allowedChatTypes.includes(context.chatType)) {
        return false;
      }
      return true;
    });

    const body = [buildInfoBox(), buildCommandsBox(visibleCommands)].join('\n');

    await context.reply(body);
  }
};
