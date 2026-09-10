'use strict';

const config = require('../config');
const logger = require('../utils/logger');

class DownloadQueue {
  constructor({ maxConcurrent = config.DOWNLOAD_QUEUE.MAX_CONCURRENT, maxQueueSize = config.DOWNLOAD_QUEUE.MAX_QUEUE_SIZE } = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.running = 0;
    this.queue = [];
  }

  /** @param {() => Promise<any>} jobFn */
  enqueue(jobFn) {
    if (this.queue.length >= this.maxQueueSize) {
      return Promise.reject(new Error('QUEUE_FULL'));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ jobFn, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const { jobFn, resolve, reject } = this.queue.shift();
      this.running++;
      let timeoutId;
      const timeout = new Promise((_, rej) => {
        timeoutId = setTimeout(() => rej(new Error('JOB_TIMEOUT')), config.DOWNLOAD_QUEUE.JOB_TIMEOUT_MS);
      });
      Promise.race([jobFn(), timeout])
        .then(resolve, reject)
        .finally(() => {
          // Without this, every job left a live 5-minute timer behind even
          // after it finished in milliseconds — harmless for the
          // long-running bot process itself, but needless timer buildup
          // under any real download volume.
          clearTimeout(timeoutId);
          this.running--;
          this._drain();
        });
    }
  }

  get pending() {
    return this.queue.length;
  }

  get active() {
    return this.running;
  }
}

// Shared singleton — all download-producing commands share one set of limits.
const sharedQueue = new DownloadQueue();
logger.debug('Download queue initialized', { maxConcurrent: sharedQueue.maxConcurrent });

module.exports = { DownloadQueue, sharedQueue };
