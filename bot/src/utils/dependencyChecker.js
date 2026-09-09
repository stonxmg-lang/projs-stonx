'use strict';

const { spawnSync } = require('child_process');

/**
 * @returns {{ ok: boolean, detail?: string }}
 */
function probeBinary(cmd, versionArgs) {
  let result;
  try {
    result = spawnSync(cmd, versionArgs, { encoding: 'utf8' });
  } catch (err) {
    return { ok: false, detail: `spawn threw: ${err.message}` };
  }

  if (result.error) {
    // e.g. ENOENT — binary genuinely not found on PATH
    return { ok: false, detail: `spawn error: ${result.error.message}` };
  }

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  const combined = `${stdout}\n${stderr}`;

  if (result.status === 0) {
    return { ok: true };
  }

  // Some builds/wrappers exit non-zero on a version probe even though the
  // binary clearly ran and printed version info — don't fail those.
  if (/version/i.test(combined) && combined.length > 0) {
    return { ok: true, detail: `ran but exited with code ${result.status} (tolerated)` };
  }

  return {
    ok: false,
    detail: `exited with code ${result.status}${result.signal ? `, signal ${result.signal}` : ''}. stderr: ${stderr.slice(0, 300) || '(empty)'}`
  };
}

function checkBinary(cmd, versionArgs = ['--version']) {
  return probeBinary(cmd, versionArgs).ok;
}

function checkAll() {
  console.log('Checking dependencies...\n');

  const nodeOk = true; // we are already running under Node

  // ffmpeg's documented flag is `-version`; some builds don't accept
  // `--version` at all, so try both before giving up.
  let ffmpegProbe = probeBinary('ffmpeg', ['-version']);
  if (!ffmpegProbe.ok) ffmpegProbe = probeBinary('ffmpeg', ['--version']);

  const ytDlpProbe = probeBinary('yt-dlp', ['--version']);

  let baileysOk = true;
  let baileysDetail;
  try {
    require.resolve('@innovatorssoft/baileys');
  } catch (err) {
    baileysOk = false;
    baileysDetail = err.message;
  }

  console.log(`Node.js     ${nodeOk ? '✅' : '❌'}`);
  console.log(`FFmpeg      ${ffmpegProbe.ok ? '✅' : '❌'}`);
  console.log(`yt-dlp      ${ytDlpProbe.ok ? '✅' : '❌'}`);
  console.log(`Baileys     ${baileysOk ? '✅' : '❌'}`);
  console.log('');

  const missing = [];
  if (!ffmpegProbe.ok) missing.push({ name: 'FFmpeg', hint: 'pkg install ffmpeg   (Termux)   /   apt install ffmpeg   (Linux)', detail: ffmpegProbe.detail });
  if (!ytDlpProbe.ok) missing.push({ name: 'yt-dlp', hint: 'pip install yt-dlp   or   pkg install yt-dlp', detail: ytDlpProbe.detail });
  if (!baileysOk) missing.push({ name: 'Baileys', hint: 'npm install', detail: baileysDetail });

  if (missing.length > 0) {
    for (const m of missing) {
      console.log(`❌ ${m.name} is not installed.`);
      console.log(`   → ${m.hint}`);
      if (m.detail) console.log(`   (diagnostic: ${m.detail})`);
      console.log('');
    }
    return false;
  }

  console.log('All dependencies ready.\n');
  return true;
}

module.exports = { checkAll, checkBinary, probeBinary };
