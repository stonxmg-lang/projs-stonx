'use strict';

const qrcodeTerminal = require('qrcode-terminal');
const logger = require('../utils/logger');

function renderQr(qrString) {
  console.log('\n📷 امسح QR من WhatsApp\n');
  qrcodeTerminal.generate(qrString, { small: true });
  console.log('\n⏳ في انتظار المسح...\n');
  // Do not log the raw QR payload — it is a valid one-time login credential.
  logger.info('QR code displayed, awaiting scan');
}

module.exports = { renderQr };
