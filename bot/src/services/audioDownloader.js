'use strict';

const { spawn } = require('child_process');
const fs = require('fs');

const logger = require('../utils/logger');
const { isValidHttpUrl } = require('../utils/validation');
const { downloadFilePath, safeUnlink, fileSizeBytes } = require('../utils/files');
const { sharedQueue } = require('./downloadQueue');
const ytdlCoreSource = require('./ytdlCoreSource');

/**
 * Downloads and extracts audio only from a URL.
 * @param {string} url
 * @returns {Promise<{ filePath: string, sizeBytes: number }>}
 */
function downloadAudio(url) {
  if (!isValidHttpUrl(url)) {
    return Promise.reject(new Error('INVALID_URL'));
  }
  return sharedQueue.enqueue(() => runYtDlpAudio(url).catch((err) => {
    if (isMissingYtDlpBinary(err) && ytdlCoreSource.isYoutubeUrl(url)) {
      logger.info('yt-dlp binary unavailable — falling back to @distube/ytdl-core', { url });
      return ytdlCoreSource.downloadAudio(url);
    }
    if (isMissingYtDlpBinary(err)) {
      throw new Error('NO_DOWNLOADER_FOR_PLATFORM');
    }
    throw err;
  }));
}

function isMissingYtDlpBinary(err) {
  return !!err && /^YT_DLP_SPAWN_FAILED/.test(err.message || '');
}

function runYtDlpAudio(url) {
  return new Promise((resolve, reject) => {
    // yt-dlp appends the real extension itself when used with -x, so we give
    // it a template without a fixed extension and locate the result after.
    const base = downloadFilePath('');
    const outputTemplate = `${base}.%(ext)s`;
    const expectedFile = `${base}.mp3`;

    const args = [
      '--no-playlist',
      '--js-runtimes', `node:${process.execPath}`,
      '--extractor-args', 'youtube:player_client=android,ios,web',
      '-x',
      '--audio-format', 'mp3',
      '--max-filesize', '100M',
      '-o', outputTemplate,
      '--',
      url
    ];

    logger.info('Starting audio download', { url });
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      reject(new Error(`YT_DLP_SPAWN_FAILED: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(expectedFile)) {
        safeUnlink(expectedFile);
        logger.warn('Audio download failed', { url, code, stderr: stderr.slice(-500) });
        reject(new Error('DOWNLOAD_FAILED'));
        return;
      }
      const sizeBytes = fileSizeBytes(expectedFile);
      logger.info('Audio download succeeded', { url, sizeBytes });
      resolve({ filePath: expectedFile, sizeBytes });
    });
  });
}

module.exports = { downloadAudio };
