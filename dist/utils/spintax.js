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
const ZERO_WIDTH_CHARS = [
    "\u200B", // Zero Width Space
    "\u200D", // Zero Width Joiner (Safe for Arabic)
    "\uFEFF", // Zero Width No-Break Space (BOM)
    // 🛑 REMOVED: "\u200C", Zero Width Non-Joiner (ZWNJ)
    // This character explicitly forces cursive letters to disconnect (م‌ق‌ط‌ع‌ة).
    // Removing it ensures Arabic text remains fully connected while still gaining cryptographic entropy.
];
/**
 * Robust regex to detect URLs so we never inject characters inside them.
 * Matches:
 *  - http(s):// and ftp:// prefixed URLs
 *  - www. prefixed URLs
 *  - Bare domain URLs like example.com or example.com/path
 *
 * Uses word-boundary and lookahead to avoid greedily consuming trailing punctuation.
 */
const URL_REGEX = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?/i;
/**
 * Generate a random zero-width character from the pool.
 */
function getRandomZeroWidthChar() {
    const index = Math.floor(Math.random() * ZERO_WIDTH_CHARS.length);
    return ZERO_WIDTH_CHARS[index];
}
/**
 * Build a short random sequence of 1-3 zero-width characters.
 * Using variable-length sequences increases uniqueness exponentially.
 */
function buildZeroWidthSequence() {
    const length = 1 + Math.floor(Math.random() * 3); // 1 to 3 chars
    let sequence = "";
    for (let i = 0; i < length; i++) {
        sequence += getRandomZeroWidthChar();
    }
    return sequence;
}
/**
 * Check whether a token contains any URL pattern.
 * If it does, the token must NOT be modified.
 */
function tokenContainsUrl(token) {
    return URL_REGEX.test(token);
}
/**
 * Inject zero-width characters into a text string to make it unique.
 *
 * The function:
 * 1. Splits text into tokens by whitespace (preserving whitespace structure).
 * 2. For each token, checks if it contains a URL — if so, skips it entirely.
 * 3. For non-URL tokens longer than 1 character, appends a random zero-width
 *    sequence at the END of the word with ~60% probability. This preserves
 *    cursive ligatures in Arabic/Persian/Urdu and avoids breaking any script.
 * 4. Prepends a unique zero-width "fingerprint" at the very start of the
 *    message (safe position — never adjacent to a trailing URL).
 *
 * @param text - The original message text
 * @returns The text with invisible zero-width characters injected
 */
export function injectZeroWidthChars(text) {
    if (!text || text.trim().length === 0) {
        return text;
    }
    // 🛑 DISABLED BY USER FEEDBACK:
    // Injecting ANY zero-width characters (even safe ones like ZWSP or BOM)
    // in between Arabic words has proven to occasionally break text rendering engines
    // on certain Android/iOS versions, causing unexpected gaps or disjointed letters.
    // To guarantee 100% pristine text delivery, we disable this entropy generator entirely.
    // The cryptographic bloat is now handled entirely by the protobuf padding (Project Chimera).
    return text;
}
//# sourceMappingURL=spintax.js.map