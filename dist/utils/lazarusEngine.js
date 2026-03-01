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
import crypto from "crypto";
import pino from "pino";
const logger = pino({
    level: "info",
    transport: {
        target: "pino-pretty",
        options: { colorize: true, ignore: "pid,hostname" },
    },
});
/**
 * Per-session drift state: the "hardware clock" wanders throughout the day.
 */
const sessionDrifts = new Map();
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
export const getClockDrift = (sessionId) => {
    // Initialize a random phase offset per session (so each session drifts differently)
    if (!sessionDrifts.has(sessionId)) {
        sessionDrifts.set(sessionId, Math.random() * Math.PI * 2);
    }
    const phaseOffset = sessionDrifts.get(sessionId);
    // Hours since midnight (0-24)
    const now = new Date();
    const hourOfDay = now.getHours() + now.getMinutes() / 60;
    // Sinusoidal drift: peaks at ~2PM, troughs at ~2AM
    // Amplitude: 800-2500ms (realistic Quartz drift range)
    const amplitude = 800 + Math.random() * 1700;
    const driftMs = amplitude * Math.sin((hourOfDay / 24) * Math.PI * 2 + phaseOffset);
    // Add micro-jitter (±50ms) for natural noise
    const jitter = (Math.random() - 0.5) * 100;
    return Math.round(driftMs + jitter);
};
/**
 * Returns a "drifted" Unix timestamp (seconds) for use in message sending.
 * This replaces raw `Date.now()` in packet generation.
 *
 * @param sessionId For per-session drift
 * @returns Unix timestamp in seconds with realistic clock drift
 */
export const getDriftedTimestamp = (sessionId) => {
    return Math.floor((Date.now() + getClockDrift(sessionId)) / 1000);
};
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
export const emitPhantomCallSignal = (socket, sessionId) => {
    if (!socket)
        return;
    (async () => {
        try {
            // Generate a fake call-id
            const callId = crypto.randomBytes(16).toString("hex");
            // Step 1: Send a "call offer" signal (ICE negotiation start)
            await socket
                .query({
                tag: "call",
                attrs: {
                    to: "@s.whatsapp.net",
                    type: "offer",
                    id: callId,
                },
                content: [
                    {
                        tag: "offer",
                        attrs: {
                            "call-id": callId,
                            "call-creator": socket.user?.id || "",
                        },
                        content: [
                            {
                                tag: "audio",
                                attrs: {
                                    enc: "opus",
                                    rate: "16000",
                                },
                            },
                        ],
                    },
                ],
            })
                .catch(() => { });
            // Step 2: Wait 500-1500ms (realistic ring time before "abort")
            const ringTime = Math.floor(Math.random() * 1000) + 500;
            await new Promise((resolve) => setTimeout(resolve, ringTime));
            // Step 3: Abort with "network error" (no actual call placed)
            await socket
                .query({
                tag: "call",
                attrs: {
                    to: "@s.whatsapp.net",
                    type: "reject",
                    id: callId,
                },
                content: [
                    {
                        tag: "reject",
                        attrs: {
                            "call-id": callId,
                            reason: "network_error",
                        },
                    },
                ],
            })
                .catch(() => { });
            logger.info(`[LAZARUS] Phantom Call: offer → reject (${ringTime}ms) for ${sessionId}`);
        }
        catch {
            // Non-critical, fail silently
        }
    })();
};
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
export const setupDelayedReadReceipts = (socket, sessionId) => {
    if (!socket)
        return;
    socket.ev.on("messages.upsert", async (upsert) => {
        try {
            if (upsert.type !== "notify")
                return;
            for (const msg of upsert.messages) {
                // Only process incoming messages (not our own)
                if (msg.key.fromMe)
                    continue;
                if (!msg.key.remoteJid)
                    continue;
                // Skip status broadcasts and newsletters
                if (msg.key.remoteJid === "status@broadcast" ||
                    msg.key.remoteJid.endsWith("@newsletter")) {
                    continue;
                }
                // Extract message text to calculate word count
                const body = msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption ||
                    msg.message?.documentMessage?.caption ||
                    "";
                if (!body || body.length === 0) {
                    // Non-text message: "glance" at it for 1-3 seconds
                    const glanceDelay = Math.floor(Math.random() * 2000) + 1000;
                    setTimeout(async () => {
                        try {
                            await socket.readMessages([msg.key]);
                        }
                        catch {
                            // Ignore read receipt failures
                        }
                    }, glanceDelay);
                    continue;
                }
                // Count words (handle both Arabic and Latin text)
                const wordCount = body.trim().split(/\s+/).length;
                // Human reading speed: 200-300 WPM (average 250)
                const readingWPM = 200 + Math.floor(Math.random() * 100);
                const readingTimeMs = Math.round((wordCount / readingWPM) * 60 * 1000);
                // Add "comprehension pause" (1-3 seconds after reading)
                const comprehensionPause = Math.floor(Math.random() * 2000) + 1000;
                // Total delay = reading time + comprehension
                const totalDelay = Math.max(1500, Math.min(30000, readingTimeMs + comprehensionPause));
                // 70% chance to actually send the read receipt (some messages humans ignore)
                if (Math.random() < 0.7) {
                    setTimeout(async () => {
                        try {
                            await socket.readMessages([msg.key]);
                            logger.info(`[LAZARUS] Read Receipt: ${wordCount} words → ${totalDelay}ms delay for ${sessionId}`);
                        }
                        catch {
                            // Ignore read receipt failures
                        }
                    }, totalDelay);
                }
            }
        }
        catch {
            // Non-critical, fail silently
        }
    });
    logger.info(`[LAZARUS] Delayed Read Receipts listener active for ${sessionId}`);
};
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
export const inflateCiphertextPadding = (text) => {
    // iOS WhatsApp adds 16-64 bytes of random padding
    // We simulate this with invisible Unicode characters
    const paddingLength = Math.floor(Math.random() * 49) + 16;
    // Build invisible padding using a mix of zero-width characters
    const invisibleChars = [
        "\u200B", // Zero-Width Space
        "\u200C", // Zero-Width Non-Joiner
        "\u200D", // Zero-Width Joiner
        "\uFEFF", // Zero-Width No-Break Space
        "\u2060", // Word Joiner
        "\u2061", // Function Application
        "\u2062", // Invisible Times
        "\u2063", // Invisible Separator
    ];
    let padding = "";
    for (let i = 0; i < paddingLength; i++) {
        padding +=
            invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
    }
    return text + padding;
};
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
export const startCallSignalScheduler = (socket, sessionId) => {
    if (!socket)
        return null;
    // First call signal after 30-90 minutes
    setTimeout(() => emitPhantomCallSignal(socket, sessionId), Math.floor(Math.random() * 60 * 60 * 1000) + 30 * 60 * 1000);
    // Then every 2-6 hours
    const intervalMs = Math.floor(Math.random() * (6 - 2 + 1) * 60 * 60 * 1000) +
        2 * 60 * 60 * 1000;
    return setInterval(() => emitPhantomCallSignal(socket, sessionId), intervalMs);
};
/**
 * Cleanup drift state for a disconnected session.
 * @param sessionId The session to clean up
 */
export const cleanupDriftState = (sessionId) => {
    sessionDrifts.delete(sessionId);
};
//# sourceMappingURL=lazarusEngine.js.map