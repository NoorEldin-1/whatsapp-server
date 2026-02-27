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
 * 1. Identifies and preserves all URLs in the text (no injection inside links).
 * 2. Splits the remaining text by words.
 * 3. Injects a random zero-width sequence between ~60% of word boundaries.
 * 4. Appends a unique zero-width "fingerprint" at the end of the message.
 *
 * @param text - The original message text
 * @returns The text with invisible zero-width characters injected
 */
export declare function injectZeroWidthChars(text: string): string;
//# sourceMappingURL=spintax.d.ts.map