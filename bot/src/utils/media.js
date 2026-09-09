'use strict';

// NOTE: This reads the *standard* Baileys message envelope shape
// (message.imageMessage / message.videoMessage / message.audioMessage).
// If your modified Baileys renames these keys, adjust this file only —
// nothing else in the project depends on the raw shape directly.

function getMessageContent(message) {
  if (!message) return null;
  return message.message || message;
}

function detectMediaType(message) {
  const content = getMessageContent(message);
  if (!content) return null;
  if (content.imageMessage) return 'image';
  if (content.videoMessage) return 'video';
  if (content.audioMessage) return 'audio';
  if (content.documentMessage) return 'document';
  return null;
}

function getQuotedMessage(message) {
  const content = getMessageContent(message);
  const contextInfo =
    content?.extendedTextMessage?.contextInfo ||
    content?.imageMessage?.contextInfo ||
    content?.videoMessage?.contextInfo ||
    content?.conversation?.contextInfo;
  if (!contextInfo || !contextInfo.quotedMessage) return null;
  return {
    message: contextInfo.quotedMessage,
    participant: contextInfo.participant,
    stanzaId: contextInfo.stanzaId
  };
}

function getTextBody(message) {
  const content = getMessageContent(message);
  if (!content) return '';
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    ''
  ).trim();
}

module.exports = {
  getMessageContent,
  detectMediaType,
  getQuotedMessage,
  getTextBody
};
