'use strict';

const logger = require('../utils/logger');

// Confirmed against @innovatorssoft/baileys' published docs: this fork
// exports a dedicated `StatusHelper` specifically because the raw
// `sock.sendMessage('status@broadcast', ...)` path (what we used before)
// is documented upstream Baileys behavior but widely reported as
// unreliable — it resolves without throwing while silently posting
// nothing (see e.g. WhiskeySockets/Baileys issues #2118, #619). This fork's
// docs state: "You can now send statuses directly to group JIDs by
// including them in the jidList. StatusHelper.send() handles both cases
// automatically" — i.e. passing a group's own JID posts a *Group Status*
// visible to that group's members, while passing individual contact JIDs
// posts a personal status visible to just those contacts.
const { StatusHelper } = require('@innovatorssoft/baileys');

/**
 * @param {object} sock - active Baileys socket
 * @param {object} media
 * @param {'image'|'video'|'audio'|'text'} media.type
 * @param {string} [media.filePath] - required for image/video/audio
 * @param {string} [media.caption] - applies to image/video only (WhatsApp
 *   status audio has no caption overlay, same as a normal audio message)
 * @param {string} [media.text] - required for type 'text'
 * @param {string} [media.backgroundColor] - required for type 'text', e.g. '#808080'
 * @param {string[]} jidList - REQUIRED. Either a group JID (posts a Group
 *   Status visible to that group) or individual contact JIDs (posts a
 *   personal status visible only to those contacts) — StatusHelper.send()
 *   distinguishes the two automatically per the fork's docs.
 */
async function postStory(sock, media, jidList) {
  if (!Array.isArray(jidList) || jidList.length === 0) {
    const err = new Error('EMPTY_JID_LIST');
    err.userMessage = '❌ لا توجد وجهة معروفة لنشر الـStory عليها.';
    throw err;
  }

  // Same content shape as a normal sendMessage call — StatusHelper.send()
  // is documented to accept pre-built content, not just its own
  // StatusHelper.text() helper.
  let content;
  if (media.type === 'image') {
    content = { image: { url: media.filePath }, caption: media.caption };
  } else if (media.type === 'video') {
    content = { video: { url: media.filePath }, caption: media.caption };
  } else if (media.type === 'audio') {
    // Voice-note-style status: no caption field, matching how a normal
    // audio message works elsewhere in WhatsApp.
    content = { audio: { url: media.filePath }, mimetype: 'audio/ogg; codecs=opus', ptt: true };
  } else if (media.type === 'text') {
    // Documented Baileys text-status shape: no file at all, just the text
    // plus a background color rendered behind it.
    content = { text: media.text, backgroundColor: media.backgroundColor || '#808080' };
  } else {
    const err = new Error('UNSUPPORTED_STORY_TYPE');
    err.userMessage = '❌ نوع غير مدعوم للـStory.';
    throw err;
  }

  try {
    await StatusHelper.send(sock, content, jidList);
    logger.info('Story posted', { mediaType: media.type, targets: jidList.length });
  } catch (err) {
    logger.error('Failed to post story', { error: err.message });
    const wrapped = new Error('STORY_SEND_FAILED');
    wrapped.userMessage = '❌ تعذر نشر الـStory.';
    throw wrapped;
  }
}

/**
 * Publish a post to a WhatsApp Channel (a "newsletter" in Baileys' terms).
 * Unlike a group/personal Status, a channel post is NOT end-to-end
 * encrypted and needs no Signal session/USync at all — Baileys sends it as
 * plaintext to the channel's own JID, the same way any other message send
 * works. That's why this takes `bot` (for its plain sendMessage facade)
 * instead of the raw `sock` + StatusHelper that postStory() needs.
 *
 * @param {object} bot - the bot facade (has sendMessage(jid, content))
 * @param {object} media
 * @param {'image'|'video'|'audio'|'text'} media.type
 * @param {string} [media.filePath] - required for image/video/audio
 * @param {string} [media.caption] - applies to image/video only
 * @param {string} [media.text] - required for type 'text'
 * @param {string} channelJid - the target channel's JID (ends in @newsletter)
 */
async function postToChannel(bot, media, channelJid) {
  if (!channelJid) {
    const err = new Error('NO_CHANNEL_JID');
    err.userMessage = '❌ لا توجد قناة محددة. استخدم: /settings channel <jid>';
    throw err;
  }

  let content;
  if (media.type === 'image') {
    content = { image: { url: media.filePath }, caption: media.caption };
  } else if (media.type === 'video') {
    content = { video: { url: media.filePath }, caption: media.caption };
  } else if (media.type === 'audio') {
    // A channel post, not a personal voice note — plain audio, not ptt.
    content = { audio: { url: media.filePath }, mimetype: 'audio/ogg; codecs=opus', ptt: false };
  } else if (media.type === 'text') {
    content = { text: media.text };
  } else {
    const err = new Error('UNSUPPORTED_CHANNEL_POST_TYPE');
    err.userMessage = '❌ نوع غير مدعوم للنشر على القناة.';
    throw err;
  }

  try {
    await bot.sendMessage(channelJid, content);
    logger.info('Channel post published', { mediaType: media.type, channelJid });
  } catch (err) {
    logger.error('Failed to publish channel post', { error: err.message, channelJid });
    const wrapped = new Error('CHANNEL_POST_FAILED');
    wrapped.userMessage = '❌ تعذر النشر على القناة.';
    throw wrapped;
  }
}

module.exports = { postStory, postToChannel };
