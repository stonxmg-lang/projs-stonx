'use strict';

// Two backends behind one API:
//  - a real `ffmpeg` binary via spawn(), when one is on PATH (Termux/desktop) —
//    this is the well-tested path audioExtractor.js/voiceService.js used
//    directly before.
//  - @ffmpeg/ffmpeg (ffmpeg.wasm), for the standalone Android APK build,
//    where nodejs-mobile has no shell and no external binaries at all.
//
// Callers (audioExtractor.js, voiceService.js) don't need to know which one
// ran — they always get an input/output file path in, file path out.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { checkBinary } = require('../utils/dependencyChecker');

let cachedHasBinary = null;
function hasFfmpegBinary() {
  if (cachedHasBinary === null) {
    cachedHasBinary = checkBinary('ffmpeg', ['-version']) || checkBinary('ffmpeg', ['--version']);
  }
  return cachedHasBinary;
}

// ---- Backend 1: real ffmpeg binary ----

function runNativeFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`FFMPEG_SPAWN_FAILED: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFMPEG_EXIT_${code}: ${stderr.slice(-500)}`));
        return;
      }
      resolve();
    });
  });
}

// ---- Backend 2: ffmpeg.wasm ----
//
// NOTE ON RISK: @ffmpeg/ffmpeg ships as an ES module even though this
// project is CommonJS, hence the dynamic import() below instead of
// require() (works from CJS, unlike require()). This whole backend has NOT
// been run against a real WASM build in the sandbox this was written in —
// there is no network access there to npm install @ffmpeg/ffmpeg or
// @ffmpeg/core at all, so this is implemented from the documented API but
// needs a real on-device/CI run to confirm the exact load() call below
// works as expected before relying on it. Please report back the
// node-error.log output if the "ffmpeg.wasm" path throws — one line to
// adjust here (e.g. the coreURL/wasmURL shape) is far cheaper than
// guessing further blind.
let wasmInstancePromise = null;

async function getWasmFfmpeg() {
  if (!wasmInstancePromise) {
    wasmInstancePromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const ffmpeg = new FFmpeg();
      const coreEntry = require.resolve('@ffmpeg/core/dist/umd/ffmpeg-core.js');
      const coreDir = path.dirname(coreEntry);
      await ffmpeg.load({
        coreURL: `file://${path.join(coreDir, 'ffmpeg-core.js')}`,
        wasmURL: `file://${path.join(coreDir, 'ffmpeg-core.wasm')}`
      });
      logger.info('ffmpeg.wasm loaded (no system ffmpeg binary available)');
      return ffmpeg;
    })().catch((err) => {
      wasmInstancePromise = null; // allow retrying on the next call instead of caching a failure forever
      throw err;
    });
  }
  return wasmInstancePromise;
}

async function runWasmFfmpeg(inputPath, args, virtualInputName, virtualOutputName) {
  const ffmpeg = await getWasmFfmpeg();
  const inputData = await fs.promises.readFile(inputPath);
  await ffmpeg.writeFile(virtualInputName, inputData);
  try {
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) throw new Error(`FFMPEG_WASM_EXIT_${exitCode}`);
    const outputData = await ffmpeg.readFile(virtualOutputName);
    return Buffer.from(outputData);
  } finally {
    try { await ffmpeg.deleteFile(virtualInputName); } catch (_) { /* best-effort cleanup */ }
    try { await ffmpeg.deleteFile(virtualOutputName); } catch (_) { /* best-effort cleanup */ }
  }
}

function tmpName(ext) {
  return `${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

// ---- Public API ----

/** Extracts/transcodes the audio track of a video (or any ffmpeg-readable
 *  audio) into an mp3 at outputPath. */
async function toMp3(inputPath, outputPath) {
  if (hasFfmpegBinary()) {
    await runNativeFfmpeg(['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outputPath]);
    return;
  }
  const inName = tmpName('input');
  const outName = tmpName('mp3');
  const buf = await runWasmFfmpeg(
    inputPath,
    ['-i', inName, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outName],
    inName,
    outName
  );
  await fs.promises.writeFile(outputPath, buf);
}

/** Encodes to opus/ogg for a WhatsApp PTT (voice-note) bubble. */
async function toOggOpus(inputPath, outputPath) {
  if (hasFfmpegBinary()) {
    await runNativeFfmpeg(['-y', '-i', inputPath, '-c:a', 'libopus', '-ar', '48000', '-ac', '1', '-b:a', '32k', outputPath]);
    return;
  }
  const inName = tmpName('input');
  const outName = tmpName('ogg');
  const buf = await runWasmFfmpeg(
    inputPath,
    ['-i', inName, '-c:a', 'libopus', '-ar', '48000', '-ac', '1', '-b:a', '32k', outName],
    inName,
    outName
  );
  await fs.promises.writeFile(outputPath, buf);
}

module.exports = { toMp3, toOggOpus, hasFfmpegBinary };
