'use strict';

/** Very small, strict URL guard used before anything touches a downloader. */
function isValidHttpUrl(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 2048) return false;
  let url;
  try {
    url = new URL(candidate);
  } catch (_) {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Rejects characters that have no business in an argument passed to
 * spawn/execFile as a single argv element. We use spawn/execFile (never a
 * shell string), so this is defense-in-depth, not the only protection.
 */
function hasShellMetacharacters(str) {
  return /[;&|`$(){}<>\\\n\r]/.test(str);
}

function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

function isValidPhoneNumber(candidate) {
  if (typeof candidate !== 'string') return false;
  const digits = candidate.replace(/[^0-9]/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

module.exports = {
  isValidHttpUrl,
  hasShellMetacharacters,
  extractFirstUrl,
  isValidPhoneNumber
};
