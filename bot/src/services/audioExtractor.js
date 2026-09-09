'use strict';

const { spawn } = require('child_process');
const fs = require('fs');

const logger = require('../utils/logger');
const { tempFilePath, safeUnlink, fileSizeBytes } = require('../utils/files');

/**
 * @param {string} videoFilePath - local path to an already-downloaded video file
 * @returns {Promise<{ filePath: string, sizeBytes: number }>}
 */
function extractAudio(videoFilePath) {
  return new Promise((resolve, reject) => {
    const outputPath = tempFilePath('mp3');

    const args = [
      '-y',
      '-i', videoFilePath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      outputPath
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      reject(new Error(`FFMPEG_SPAWN_FAILED: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(outputPath)) {
        safeUnlink(outputPath);
        logger.warn('Audio extraction failed', { code, stderr: stderr.slice(-500) });
        reject(new Error('EXTRACTION_FAILED'));
        return;
      }
      const sizeBytes = fileSizeBytes(outputPath);
      logger.info('Audio extraction succeeded', { sizeBytes });
      resolve({ filePath: outputPath, sizeBytes });
    });
  });
}

module.exports = { extractAudio };
