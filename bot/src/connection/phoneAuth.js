'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');
const { isValidPhoneNumber } = require('../utils/validation');

// Previously this prompted for the phone number on the terminal (readline).
// The Android control-panel app now supplies the number over the local API
// instead, so there is no interactive prompt anymore — validation is done
// on the value the app submits (see connectionManager.submitPhoneNumber).

function formatCode(rawCode) {
  const clean = String(rawCode).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return clean;
}

// WhatsApp's pairing protocol accepts a caller-chosen 8-char alphanumeric
// code (this is what forks call a "custom pairing code"). We generate our
// own random one and pass it explicitly — without this, this specific fork
// (@innovatorssoft/baileys) silently defaults to its own branded string
// ("INNOVATOR") instead of a random WhatsApp-issued code.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
function generateRandomCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function displayCode(code) {
  const formatted = formatCode(code);
  console.log('\n╔══════════════════════╗');
  console.log('║      LINK CODE       ║');
  console.log('╠══════════════════════╣');
  console.log(`║      ${formatted.padEnd(15)}║`);
  console.log('╚══════════════════════╝\n');
  console.log('افتح WhatsApp:');
  console.log('الإعدادات → الأجهزة المرتبطة → ربط جهاز → الربط باستخدام رقم الهاتف');
  console.log('ثم أدخل الرمز.\n');
  // The code itself is never written to the log file — only the fact that one was issued.
  logger.info('Pairing code displayed to user');
}

/**
 * @param {object} sock - active Baileys socket (pre-open)
 * @param {string} phoneNumber - digits only, country code first, no '+'
 * Confirmed against @innovatorssoft/baileys' published docs:
 *   sock.requestPairingCode(phoneNumber, customCode) // 8 alphanumeric chars
 * We always pass our own random 8-char code — see generateRandomCode() above
 * for why relying on the library's own default isn't safe here.
 */
async function requestPairingCode(sock, phoneNumber) {
  if (!isValidPhoneNumber(phoneNumber)) {
    throw new Error('invalid phone number');
  }
  const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, '');
  const customCode = generateRandomCode();
  const code = await sock.requestPairingCode(cleanNumber, customCode);
  const formatted = formatCode(code);
  displayCode(formatted);
  return formatted;
}

module.exports = { formatCode, displayCode, generateRandomCode, requestPairingCode };
