/**
 * 🛡️ PROJECT LAZARUS: Temporal Dissonance & WebRTC Forgery Engine
 *
 * Reverse-engineers the deepest layers of Meta's detection:
 * - NTP Clock Synchronization Analysis (temporal fingerprinting)
 * - WebRTC Call Stack Presence (voice/video trust signals)
 * - Read Receipt Timing Correlation (instant = bot)
 * - Noise Protocol Padding Distribution (library fingerprinting)
 *
 * Core Functions:
 * 1. getClockDrift — Sinusoidal NTP drift emulation
 * 2. emitPhantomCallSignal — WebRTC ICE candidate injection
 * 3. setupDelayedReadReceipts — Biological reading speed
 * 4. inflateCiphertextPadding — iOS-matching message padding
 */
import { WASocket } from "@whiskeysockets/baileys";
/**
 * ⏰ Hardware Clock Drift Emulation (NTP Spoofing)
 *
 * Cloud servers sync their clock via NTP to sub-millisecond accuracy.
 * Real phone hardware clocks use Quartz oscillators that drift by
 * 0.5-3 seconds over a 24-hour cycle due to temperature changes.
 *
 * This function returns a "drift offset" in milliseconds that should
 * be ADDED to `Date.now()` when generating message timestamps:
 *   `messageTimestamp = Math.floor((Date.now() + getClockDrift(sid)) / 1000)`
 *
 * The drift follows a sinusoidal curve over 24 hours:
 * - Morning: phone is cold → clock is slow (negative drift)
 * - Afternoon: phone is hot → clock speeds up (positive drift)
 * - Night: phone cools → drift decreases
 *
 * @param sessionId For per-session unique drift patterns
 * @returns Millisecond offset to add to Date.now()
 */
export declare const getClockDrift: (sessionId: string) => number;
/**
 * Returns a "drifted" Unix timestamp (seconds) for use in message sending.
 * This replaces raw `Date.now()` in packet generation.
 *
 * @param sessionId For per-session drift
 * @returns Unix timestamp in seconds with realistic clock drift
 */
export declare const getDriftedTimestamp: (sessionId: string) => number;
/**
 * 📞 WebRTC Phantom Call Signal (ICE Candidate Injection)
 *
 * Spam accounts NEVER use voice/video calls. Meta's trust system
 * gives enormous weight to accounts that negotiate call sessions
 * (even failed ones). A single "missed call" handshake is worth
 * more trust than 100 text messages.
 *
 * This function emits a fake WebRTC "call offer" IQ stanza
 * (ICE candidate negotiation) and immediately aborts it with
 * a "network failure" signal. No actual call is placed.
 *
 * Should fire every 2-6 hours (very infrequent to seem natural).
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 */
export declare const emitPhantomCallSignal: (socket: WASocket | null, sessionId: string) => void;
/**
 * 👁️ Biological Reading Speed Simulator (Delayed Read Receipts)
 *
 * When a bot receives a message, it either:
 * - Reads it instantly (0ms delay) → FLAGGED AS BOT
 * - Never reads it → suspicious for an "active" sender
 *
 * Real humans read at ~250 words per minute (WPM).
 * A 50-word message takes ~12 seconds to read.
 *
 * This function sets up an event listener on incoming messages.
 * When a message arrives, it calculates the biological reading
 * time based on word count, then sends the "read" receipt after
 * exactly that delay.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 */
export declare const setupDelayedReadReceipts: (socket: WASocket | null, sessionId: string) => void;
/**
 * 📐 iOS E2EE Ciphertext Padding Inflation
 *
 * Different WhatsApp clients (iOS, Android, Web, Baileys) produce
 * slightly different padding patterns in their encrypted messages.
 * Meta can statistically fingerprint which client sent a message
 * based on ciphertext byte distributions.
 *
 * iOS WhatsApp tends to produce slightly longer messages due to
 * its padding algorithm adding 16-64 extra random bytes.
 *
 * This function appends invisible Unicode padding to the message
 * text BEFORE encryption, inflating the ciphertext to match iOS
 * patterns. The padding uses Zero-Width characters that are
 * completely invisible to the recipient.
 *
 * @param text The original message text
 * @returns Text with invisible iOS-matching padding appended
 */
export declare const inflateCiphertextPadding: (text: string) => string;
/**
 * 🎛️ Call Signal Scheduler (Background)
 *
 * Schedules phantom WebRTC call signals to fire every 2-6 hours.
 * Should be called once on session connect.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 * @returns NodeJS.Timeout for cleanup
 */
export declare const startCallSignalScheduler: (socket: WASocket | null, sessionId: string) => NodeJS.Timeout | null;
/**
 * Cleanup drift state for a disconnected session.
 * @param sessionId The session to clean up
 */
export declare const cleanupDriftState: (sessionId: string) => void;
//# sourceMappingURL=lazarusEngine.d.ts.map