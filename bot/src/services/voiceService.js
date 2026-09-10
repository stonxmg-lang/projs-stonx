'use strict';

const fs = require('fs');
const path = require('path');

const config = require('../config');
const logger = require('../utils/logger');
const ffmpegRuntime = require('./ffmpegRuntime');

const CACHED_OGG_PATH = path.join(config.MEDIA_DIR, 'male', '.salawat.cache.ogg');

/** WhatsApp PTT bubbles expect opus/ogg — convert once and cache the result.
 *  Uses ffmpegRuntime, which picks the real `ffmpeg` binary when available
 *  (Termux/desktop) or ffmpeg.wasm otherwise (standalone Android APK). */
async function ensureOggEncoded() {
  if (fs.existsSync(CACHED_OGG_PATH)) {
    const sourceMtime = fs.statSync(config.MALE_AUDIO_PATH).mtimeMs;
    const cacheMtime = fs.statSync(CACHED_OGG_PATH).mtimeMs;
    if (cacheMtime >= sourceMtime) return CACHED_OGG_PATH;
  }

  if (!fs.existsSync(config.MALE_AUDIO_PATH)) {
    throw new Error('MALE_AUDIO_ASSET_MISSING');
  }

  try {
    await ffmpegRuntime.toOggOpus(config.MALE_AUDIO_PATH, CACHED_OGG_PATH);
  } catch (err) {
    logger.error('Failed to encode male audio to opus/ogg', { error: err.message });
    throw new Error('ENCODE_FAILED');
  }

  if (!fs.existsSync(CACHED_OGG_PATH)) {
    throw new Error('ENCODE_FAILED');
  }
  return CACHED_OGG_PATH;
}

/**
 * @param {object} sock - active Baileys socket
 * @param {string} targetJid
 * VERIFY-AGAINST-YOUR-BAILEYS: `sock.sendMessage(jid, { audio, mimetype, ptt: true })`
 * is the standard shape for sending a voice note. Confirm the mimetype string
 * and `ptt` flag are honored the same way in your modified fork.
 */
async function sendVoiceMessage(sock, targetJid) {
  const oggPath = await ensureOggEncoded();
  const buffer = await fs.promises.readFile(oggPath);
  await sock.sendMessage(targetJid, {
    audio: buffer,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true
  });
}

module.exports = { sendVoiceMessage, ensureOggEncoded };
