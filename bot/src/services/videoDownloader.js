'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { isValidHttpUrl } = require('../utils/validation');
const { downloadFilePath, safeUnlink, fileSizeBytes } = require('../utils/files');
const { sharedQueue } = require('./downloadQueue');
const ytdlCoreSource = require('./ytdlCoreSource');

/**
 * Downloads a single video (no playlists, no format menus — video only).
 * @param {string} url
 * @returns {Promise<{ filePath: string, sizeBytes: number }>}
 */
function downloadVideo(url) {
  if (!isValidHttpUrl(url)) {
    return Promise.reject(new Error('INVALID_URL'));
  }

  return sharedQueue.enqueue(() => runYtDlpVideo(url).catch((err) => {
    if (isMissingYtDlpBinary(err) && ytdlCoreSource.isYoutubeUrl(url)) {
      logger.info('yt-dlp binary unavailable — falling back to @distube/ytdl-core', { url });
      return ytdlCoreSource.downloadVideo(url);
    }
    if (isMissingYtDlpBinary(err)) {
      // No yt-dlp AND not a YouTube link — there is no pure-JS engine that
      // covers arbitrary platforms the way yt-dlp does, so this is a real
      // limitation of the standalone Android build, not a transient error.
      throw new Error('NO_DOWNLOADER_FOR_PLATFORM');
    }
    throw err;
  }));
}

function isMissingYtDlpBinary(err) {
  return !!err && /^YT_DLP_SPAWN_FAILED/.test(err.message || '');
}

function runYtDlpVideo(url) {
  return new Promise((resolve, reject) => {
    const outputTemplate = downloadFilePath('mp4');

    // spawn (not exec/shell) — the URL is passed as a discrete argv element,
    // never interpolated into a shell string, so shell metacharacters in it
    // are inert.
    const args = [
      '--no-playlist',
      // YouTube's current signature-decryption path needs a JS runtime;
      // without one yt-dlp falls back to a crippled format list (this is
      // exactly what broke here). Node.js is already a hard dependency of
      // this whole project, so point yt-dlp at our own binary instead of
      // requiring a separate deno/node install.
      '--js-runtimes', `node:${process.execPath}`,
      // The android client needs less signature work in the first place —
      // extra resilience even where the JS runtime above still struggles.
      '--extractor-args', 'youtube:player_client=android,ios,web',
      '-f', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--max-filesize', '200M',
      '-o', outputTemplate,
      '--', // everything after this is a positional arg, never a flag
      url
    ];

    logger.info('Starting video download', { url });
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      // e.g. yt-dlp not installed
      reject(new Error(`YT_DLP_SPAWN_FAILED: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(outputTemplate)) {
        safeUnlink(outputTemplate);
        logger.warn('Video download failed', { url, code, stderr: stderr.slice(-500) });
        reject(new Error('DOWNLOAD_FAILED'));
        return;
      }
      const sizeBytes = fileSizeBytes(outputTemplate);
      logger.info('Video download succeeded', { url, sizeBytes });
      resolve({ filePath: outputTemplate, sizeBytes });
    });
  });
}

module.exports = { downloadVideo };
