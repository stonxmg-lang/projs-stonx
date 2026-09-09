'use strict';

const fs = require('fs');

// `downloadMediaMessage` is the standard @whiskeysockets/baileys-family
// helper for pulling media bytes off an image/video/audio message. This
// fork (@innovatorssoft/baileys) is docs-confirmed to keep the same core
// message-handling surface as upstream Baileys, so this should hold, but
// re-check if media downloads fail in testing.
const { downloadMediaMessage } = require('@innovatorssoft/baileys');
const pino = require('pino');

const logger = require('../utils/logger');
const { tempFilePath, safeUnlink } = require('../utils/files');

// Same reasoning as connection/connectionManager.js: this Baileys family may
// call `.child()` on whatever logger it's handed, so it must be a real pino
// instance, not undefined.
const mediaLogger = pino({ level: 'silent' });

/**
 * @param {object} message - full Baileys message object (message.message.xMessage present)
 * @param {string} extension - e.g. 'mp4', 'jpg'
 * @returns {Promise<string>} path to the downloaded temp file
 */
async function downloadMessageMedia(message, extension) {
  const buffer = await downloadMediaMessage(
    message,
    'buffer',
    {},
    { logger: mediaLogger }
  );
  const filePath = tempFilePath(extension);
  await fs.promises.writeFile(filePath, buffer);
  logger.debug('WhatsApp media downloaded to temp file', { filePath, bytes: buffer.length });
  return filePath;
}

async function downloadMessageMediaSafe(message, extension) {
  try {
    return await downloadMessageMedia(message, extension);
  } catch (err) {
    logger.error('Failed to download WhatsApp media', { error: err.message });
    return null;
  }
}

module.exports = { downloadMessageMedia, downloadMessageMediaSafe, safeUnlink };
