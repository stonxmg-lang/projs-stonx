'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = require('../config');
const logger = require('../utils/logger');

const CACHED_OGG_PATH = path.join(config.MEDIA_DIR, 'male', '.salawat.cache.ogg');

/** WhatsApp PTT bubbles expect opus/ogg — convert once and cache the result. */
function ensureOggEncoded() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(CACHED_OGG_PATH)) {
      const sourceMtime = fs.statSync(config.MALE_AUDIO_PATH).mtimeMs;
      const cacheMtime = fs.statSync(CACHED_OGG_PATH).mtimeMs;
      if (cacheMtime >= sourceMtime) {
        resolve(CACHED_OGG_PATH);
        return;
      }
    }

    if (!fs.existsSync(config.MALE_AUDIO_PATH)) {
      reject(new Error('MALE_AUDIO_ASSET_MISSING'));
      return;
    }

    const args = [
      '-y',
      '-i', config.MALE_AUDIO_PATH,
      '-c:a', 'libopus',
      '-ar', '48000',
      '-ac', '1',
      '-b:a', '32k',
      CACHED_OGG_PATH
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => reject(new Error(`FFMPEG_SPAWN_FAILED: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(CACHED_OGG_PATH)) {
        logger.error('Failed to encode male audio to opus/ogg', { stderr: stderr.slice(-500) });
        reject(new Error('ENCODE_FAILED'));
        return;
      }
      resolve(CACHED_OGG_PATH);
    });
  });
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
