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
/**
 * Inject zero-width characters into a text string to make it unique.
 *
 * The function:
 * 1. Splits text into tokens by whitespace (preserving whitespace structure).
 * 2. For each token, checks if it contains a URL — if so, skips it entirely.
 * 3. For non-URL tokens longer than 1 character, injects a random zero-width
 *    sequence at a random position inside the word with ~60% probability.
 * 4. Prepends a unique zero-width "fingerprint" at the very start of the
 *    message (safe position — never adjacent to a trailing URL).
 *
 * @param text - The original message text
 * @returns The text with invisible zero-width characters injected
 */
export declare function injectZeroWidthChars(text: string): string;
//# sourceMappingURL=spintax.d.ts.map