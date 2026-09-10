'use strict';

// Fallback engine for when the yt-dlp *binary* itself isn't available
// (the standalone Android APK — nodejs-mobile has no shell to spawn CLI
// tools at all). @distube/ytdl-core only understands youtube.com/youtu.be
// — unlike yt-dlp it is NOT a multi-platform downloader — so this only
// covers YouTube links. Non-YouTube URLs on a yt-dlp-less build still fail
// with a clear NO_DOWNLOADER_FOR_PLATFORM error (see videoDownloader.js /
// audioDownloader.js) rather than silently pretending to support them.

const fs = require('fs');
const logger = require('../utils/logger');
const { downloadFilePath, fileSizeBytes, safeUnlink } = require('../utils/files');
const ffmpegRuntime = require('./ffmpegRuntime');

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i;

function isYoutubeUrl(url) {
  try {
    return YOUTUBE_HOST_RE.test(new URL(url).hostname);
  } catch (_) {
    return false;
  }
}

function streamToFile(readStream, outputPath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputPath);
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);
    readStream.pipe(writeStream);
  });
}

async function downloadVideo(url) {
  const ytdl = require('@distube/ytdl-core');
  const outputPath = downloadFilePath('mp4');
  const info = await ytdl.getInfo(url);
  // A single muxed video+audio format only — merging separate high-res
  // video-only and audio-only streams needs ffmpeg, which would work via
  // ffmpegRuntime too, but this fallback is meant to be dependable above
  // all, so it deliberately stays with YouTube's own combined formats
  // (capped around 360p) rather than adding another failure point.
  const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' });
  if (!format) throw new Error('DOWNLOAD_FAILED');

  await streamToFile(ytdl.downloadFromInfo(info, { format }), outputPath);
  if (!fs.existsSync(outputPath)) throw new Error('DOWNLOAD_FAILED');
  logger.info('Video download succeeded via ytdl-core fallback', { url });
  return { filePath: outputPath, sizeBytes: fileSizeBytes(outputPath) };
}

async function downloadAudio(url) {
  const ytdl = require('@distube/ytdl-core');
  const rawPath = downloadFilePath('m4a');
  const info = await ytdl.getInfo(url);
  const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
  if (!format) throw new Error('DOWNLOAD_FAILED');

  await streamToFile(ytdl.downloadFromInfo(info, { format }), rawPath);
  if (!fs.existsSync(rawPath)) throw new Error('DOWNLOAD_FAILED');

  // Normalize to mp3 so callers always see the same format regardless of
  // which engine served the file. If ffmpeg (native or wasm) genuinely
  // isn't usable, ship the raw m4a instead of failing outright — it's
  // still a valid, playable audio file, just not transcoded.
  const mp3Path = rawPath.replace(/\.m4a$/, '.mp3');
  try {
    await ffmpegRuntime.toMp3(rawPath, mp3Path);
    safeUnlink(rawPath);
    logger.info('Audio download succeeded via ytdl-core fallback (transcoded to mp3)', { url });
    return { filePath: mp3Path, sizeBytes: fileSizeBytes(mp3Path) };
  } catch (err) {
    logger.warn('ytdl-core audio fallback: mp3 transcode failed, sending original m4a', { url, error: err.message });
    return { filePath: rawPath, sizeBytes: fileSizeBytes(rawPath) };
  }
}

module.exports = { downloadVideo, downloadAudio, isYoutubeUrl };
