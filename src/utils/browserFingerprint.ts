import { Browsers } from "@whiskeysockets/baileys";

/**
 * Generates a random, realistic browser fingerprint for WhatsApp Web sessions.
 * Avoiding Ubuntu/Linux to prevent simple bot fingerprinting.
 * Prioritizing common, real-world OS and Browser combinations like Windows/Chrome or Mac/Safari.
 * We are not using mobile agents (iOS/Android) as they might cause issues with Baileys' Web API expected flow.
 *
 * The returned format is [OS_NAME, BROWSER_NAME, BROWSER_VERSION],
 * which perfectly matches the signature for the `browser` property in Baileys' `makeWASocket()`.
 */
export function getRandomBrowserFingerprint(): [string, string, string] {
  const browserProfiles: [string, string, string][] = [
    ["Windows", "Chrome", "121.0.0"],
    ["Windows", "Edge", "121.0.0"],
    ["Windows", "Firefox", "122.0.0"],
    ["Mac OS", "Safari", "17.3.0"],
    ["Mac OS", "Chrome", "121.0.0"],
    // You can add more realistic profiles here if needed
  ];

  const randomIndex = Math.floor(Math.random() * browserProfiles.length);
  return browserProfiles[randomIndex];
}
