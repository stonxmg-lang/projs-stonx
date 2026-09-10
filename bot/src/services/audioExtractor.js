'use strict';

const fs = require('fs');

const logger = require('../utils/logger');
const { tempFilePath, safeUnlink, fileSizeBytes } = require('../utils/files');
const ffmpegRuntime = require('./ffmpegRuntime');

/**
 * @param {string} videoFilePath - local path to an already-downloaded video file
 * @returns {Promise<{ filePath: string, sizeBytes: number }>}
 */
async function extractAudio(videoFilePath) {
  const outputPath = tempFilePath('mp3');

  // ffmpegRuntime picks the real `ffmpeg` binary when one is on PATH
  // (Termux/desktop) or falls back to the bundled ffmpeg.wasm build
  // (standalone Android APK, which has no shell to spawn a binary from).
  try {
    await ffmpegRuntime.toMp3(videoFilePath, outputPath);
  } catch (err) {
    safeUnlink(outputPath);
    logger.warn('Audio extraction failed', { error: err.message });
    throw new Error('EXTRACTION_FAILED');
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error('EXTRACTION_FAILED');
  }
  const sizeBytes = fileSizeBytes(outputPath);
  logger.info('Audio extraction succeeded', { sizeBytes });
  return { filePath: outputPath, sizeBytes };
}

module.exports = { extractAudio };
