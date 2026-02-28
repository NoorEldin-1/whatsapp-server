/**
 * Generates a random, realistic browser fingerprint for WhatsApp Web sessions.
 * Avoiding Ubuntu/Linux to prevent simple bot fingerprinting.
 * Prioritizing common, real-world OS and Browser combinations like Windows/Chrome or Mac/Safari.
 * We are not using mobile agents (iOS/Android) as they might cause issues with Baileys' Web API expected flow.
 *
 * The returned format is [OS_NAME, BROWSER_NAME, BROWSER_VERSION],
 * which perfectly matches the signature for the `browser` property in Baileys' `makeWASocket()`.
 */
export declare function getRandomBrowserFingerprint(): [string, string, string];
//# sourceMappingURL=browserFingerprint.d.ts.map