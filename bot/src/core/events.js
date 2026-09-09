'use strict';

const { EventEmitter } = require('events');

/**
 * Single shared bus for the whole app.
 * Connection layer emits: 'connection.state', 'message.new', 'qr', 'pairing.code'
 * Core/bot layer subscribes and reacts (logging, routing, shutdown, etc.)
 */
class StonxEvents extends EventEmitter {}

module.exports = new StonxEvents();
