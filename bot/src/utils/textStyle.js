'use strict';

// Converts A-Z / a-z / 0-9 to their "Mathematical Monospace" Unicode code
// points (𝙰𝙱𝙲.../𝚊𝚋𝚌.../𝟶𝟷𝟸...). This is real text, not an image or a
// special font file — it renders the same styled look on every
// device/client because the glyphs themselves are Unicode characters, not
// a font choice. Case is preserved (STONX stays upper, "menu" stays lower).
const UPPER_A_CODE = 0x1d670; // 𝙰
const LOWER_A_CODE = 0x1d68a; // 𝚊
const DIGIT_0_CODE = 0x1d7f6; // 𝟶

function toMonospaceFont(input) {
  const str = String(input);
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) { // A-Z
      out += String.fromCodePoint(UPPER_A_CODE + (code - 65));
    } else if (code >= 97 && code <= 122) { // a-z
      out += String.fromCodePoint(LOWER_A_CODE + (code - 97));
    } else if (code >= 48 && code <= 57) { // 0-9
      out += String.fromCodePoint(DIGIT_0_CODE + (code - 48));
    } else {
      out += ch; // leave spaces/symbols/Arabic/punctuation etc. untouched
    }
  }
  return out;
}

module.exports = { toMonospaceFont };
