'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

/**
 * Every file in src/commands/ must export:
 *   {
 *     name: string,            // e.g. "ping" (no prefix)
 *     description: string,
 *     execute: async (context) => void
 *   }
 * This is the ONLY contract the router depends on. Adding a new command
 * later means dropping a new file here — nothing else needs to change.
 */
function validateCommandModule(mod, filename) {
  if (!mod || typeof mod.execute !== 'function' || typeof mod.name !== 'string') {
    logger.error('Invalid command module skipped', { filename });
    return false;
  }
  return true;
}

function loadCommands() {
  const registry = new Map();
  const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const mod = require(path.join(COMMANDS_DIR, file));
    if (!validateCommandModule(mod, file)) continue;
    if (registry.has(mod.name)) {
      logger.warn('Duplicate command name, keeping first registration', { name: mod.name, file });
      continue;
    }
    registry.set(mod.name, mod);
    logger.info('Command registered', { name: mod.name });
  }

  return registry;
}

module.exports = { loadCommands };
