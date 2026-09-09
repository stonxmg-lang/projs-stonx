'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

if (!fs.existsSync(config.DATABASE_DIR)) {
  fs.mkdirSync(config.DATABASE_DIR, { recursive: true });
}

/**
 * A tiny JSON document store, one file per collection.
 * This is the ONLY place that knows the storage format is "JSON files".
 * Repositories (users.js, chats.js, settings.js) call this, never fs directly.
 * Swapping to SQLite later means rewriting this file only.
 */
class JsonCollection {
  constructor(name, defaultValue) {
    this.filePath = path.join(config.DATABASE_DIR, `${name}.json`);
    this.defaultValue = defaultValue;
    this._cache = null;
    this._writeQueue = Promise.resolve();
  }

  _load() {
    if (this._cache !== null) return this._cache;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this._cache = JSON.parse(raw);
      } else {
        this._cache = structuredClone(this.defaultValue);
      }
    } catch (err) {
      logger.error(`Failed to load database collection, falling back to default`, {
        file: this.filePath,
        error: err.message
      });
      this._cache = structuredClone(this.defaultValue);
    }
    return this._cache;
  }

  read() {
    return this._load();
  }

  /** Persists synchronously via write-to-temp-then-rename (atomic on POSIX). */
  write(data) {
    this._cache = data;
    this._writeQueue = this._writeQueue.then(() => this._persist(data));
    return this._writeQueue;
  }

  async _persist(data) {
    const tmpPath = `${this.filePath}.tmp`;
    try {
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.promises.rename(tmpPath, this.filePath);
    } catch (err) {
      logger.error('Failed to persist database collection', { file: this.filePath, error: err.message });
    }
  }
}

module.exports = { JsonCollection };
