'use strict';

const config = require('../config');
const logger = require('../utils/logger');

class ReconnectScheduler {
  constructor() {
    this.attempt = 0;
    this._timer = null;
  }

  reset() {
    this.attempt = 0;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** @param {() => void} reconnectFn */
  schedule(reconnectFn) {
    if (this._timer) return; // already scheduled — never stack timers
    this.attempt += 1;
    const delay = Math.min(
      config.RECONNECT.BASE_DELAY_MS * 2 ** (this.attempt - 1),
      config.RECONNECT.MAX_DELAY_MS
    );
    logger.info('Scheduling reconnect', { attempt: this.attempt, delayMs: delay });
    this._timer = setTimeout(() => {
      this._timer = null;
      reconnectFn();
    }, delay);
  }

  cancel() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

module.exports = { ReconnectScheduler };
