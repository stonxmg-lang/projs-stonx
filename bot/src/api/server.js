'use strict';

// Local-only control API for the STONX Android app.
//
// Binds to 127.0.0.1 ONLY — never 0.0.0.0 — because this exposes session
// control (including a working QR / pairing code while auth is pending) and
// is meant to be reachable solely from the app running on the same device.
// The app talks to it over plain HTTP on localhost; nothing here is meant
// to cross the network.

const http = require('http');
const { parse: parseUrl } = require('url');
const QRCode = require('qrcode');
const logger = require('../utils/logger');
const config = require('../config');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('body too large'));
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {import('../connection/connectionManager').ConnectionManager} connectionManager
 */
function startApiServer(connectionManager) {
  const server = http.createServer(async (req, res) => {
    const { pathname } = parseUrl(req.url);

    try {
      if (req.method === 'GET' && pathname === '/api/status') {
        return sendJson(res, 200, {
          state: connectionManager.getState(),
          ownJid: connectionManager.ownJid,
          hasQr: !!connectionManager.latestQr,
          pairingCode: connectionManager.latestPairingCode || null
        });
      }

      if (req.method === 'POST' && pathname === '/api/method') {
        const body = await readJsonBody(req);
        if (body.method !== 'phone' && body.method !== 'qr') {
          return sendJson(res, 400, { error: 'method must be "phone" or "qr"' });
        }
        connectionManager.setAuthMethodChoice(body.method === 'phone' ? '1' : '2');
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'POST' && pathname === '/api/phone') {
        const body = await readJsonBody(req);
        const digits = String(body.number || '').replace(/[^0-9]/g, '');
        if (digits.length < 8 || digits.length > 15) {
          return sendJson(res, 400, { error: 'invalid phone number' });
        }
        connectionManager.submitPhoneNumber(digits);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && pathname === '/api/qr.png') {
        const qr = connectionManager.latestQr;
        if (!qr) return sendJson(res, 404, { error: 'no qr available yet' });
        const png = await QRCode.toBuffer(qr, { width: 512, margin: 1 });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
        return res.end(png);
      }

      if (req.method === 'POST' && pathname === '/api/logout') {
        await connectionManager.requestLogout();
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && pathname === '/api/logs') {
        return sendJson(res, 200, { lines: logger.getRecentLogs() });
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      logger.error('Control API request failed', { error: err.message });
      sendJson(res, 500, { error: 'internal error' });
    }
  });

  server.listen(config.API.PORT, config.API.HOST, () => {
    logger.info('Local control API listening', { host: config.API.HOST, port: config.API.PORT });
  });

  server.on('error', (err) => {
    logger.error('Control API server error', { error: err.message });
  });

  return server;
}

module.exports = { startApiServer };
