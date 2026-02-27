/**
 * Zero-Width Characters Spintax Utility
 *
 * Injects invisible Unicode characters into text to make each message
 * cryptographically unique (different hash) while appearing identical
 * to the human eye. This defeats WhatsApp's duplicate-message detection
 * algorithms that flag copy-paste spam campaigns.
 *
 * Supported zero-width characters:
 * - U+200B  Zero Width Space
 * - U+200C  Zero Width Non-Joiner
 * - U+200D  Zero Width Joiner
 * - U+FEFF  Zero Width No-Break Space (BOM)
 */

const ZERO_WIDTH_CHARS: string[] = [
  "\u200B", // Zero Width Space
  "\u200C", // Zero Width Non-Joiner
  "\u200D", // Zero Width Joiner
  "\uFEFF", // Zero Width No-Break Space
];

/**
 * Regex to detect URLs so we never inject characters inside them.
 * Matches http(s), ftp, and common URL patterns.
 */
const URL_REGEX =
  /https?:\/\/[^\s]+|ftp:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s]*/g;

/**
 * Generate a random zero-width character from the pool.
 */
function getRandomZeroWidthChar(): string {
  const index = Math.floor(Math.random() * ZERO_WIDTH_CHARS.length);
  return ZERO_WIDTH_CHARS[index];
}

/**
 * Build a short random sequence of 1-3 zero-width characters.
 * Using variable-length sequences increases uniqueness exponentially.
 */
function buildZeroWidthSequence(): string {
  const length = 1 + Math.floor(Math.random() * 3); // 1 to 3 chars
  let sequence = "";
  for (let i = 0; i < length; i++) {
    sequence += getRandomZeroWidthChar();
  }
  return sequence;
}

/**
 * Inject zero-width characters into a text string to make it unique.
 *
 * The function:
 * 1. Identifies and preserves all URLs in the text (no injection inside links).
 * 2. Splits the remaining text by words.
 * 3. Injects a random zero-width sequence between ~60% of word boundaries.
 * 4. Appends a unique zero-width "fingerprint" at the end of the message.
 *
 * @param text - The original message text
 * @returns The text with invisible zero-width characters injected
 */
export function injectZeroWidthChars(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  // Step 1: Extract and map all URLs to placeholders
  const urlMap: Map<string, string> = new Map();
  let placeholderIndex = 0;

  const textWithPlaceholders = text.replace(URL_REGEX, (match) => {
    const placeholder = `__ZW_URL_${placeholderIndex}__`;
    urlMap.set(placeholder, match);
    placeholderIndex++;
    return placeholder;
  });

  // Step 2: Split text into words (preserving whitespace structure)
  const tokens = textWithPlaceholders.split(/(\s+)/);

  // Step 3: Inject zero-width chars between words with ~60% probability
  const injectedTokens = tokens.map((token, index) => {
    // Skip whitespace tokens and URL placeholders
    if (/^\s+$/.test(token) || token.startsWith("__ZW_URL_")) {
      return token;
    }

    // Skip very short tokens (1 char) to avoid disrupting formatting
    if (token.length <= 1) {
      return token;
    }

    // Inject with 60% probability at a random position within the word
    if (Math.random() < 0.6) {
      const pos = 1 + Math.floor(Math.random() * (token.length - 1));
      return token.slice(0, pos) + buildZeroWidthSequence() + token.slice(pos);
    }

    return token;
  });

  let result = injectedTokens.join("");

  // Step 4: Append a unique zero-width fingerprint at the end
  result += buildZeroWidthSequence();

  // Step 5: Restore original URLs from placeholders
  for (const [placeholder, originalUrl] of urlMap.entries()) {
    result = result.replace(placeholder, originalUrl);
  }

  return result;
}
