'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');
const TEMP_DIR = path.join(ROOT, 'temp');

for (const dir of [DOWNLOADS_DIR, TEMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Generates a random, collision-safe filename inside a known-safe base dir.
 * Callers must never accept a user-supplied path/filename directly.
 */
function tempFilePath(extension = '') {
  const name = crypto.randomBytes(16).toString('hex') + (extension ? `.${extension.replace(/^\./, '')}` : '');
  return path.join(TEMP_DIR, name);
}

function downloadFilePath(extension = '') {
  const name = crypto.randomBytes(16).toString('hex') + (extension ? `.${extension.replace(/^\./, '')}` : '');
  return path.join(DOWNLOADS_DIR, name);
}

/** Ensures a resolved path stays inside an allowed base directory (no traversal). */
function isPathInside(base, target) {
  const rel = path.relative(base, target);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    require('./logger').warn('Failed to clean up temp file', { filePath, error: err.message });
  }
}

function safeUnlinkMany(filePaths) {
  for (const f of filePaths || []) safeUnlink(f);
}

function fileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_) {
    return 0;
  }
}

function humanFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

module.exports = {
  DOWNLOADS_DIR,
  TEMP_DIR,
  tempFilePath,
  downloadFilePath,
  isPathInside,
  safeUnlink,
  safeUnlinkMany,
  fileSizeBytes,
  humanFileSize
};
