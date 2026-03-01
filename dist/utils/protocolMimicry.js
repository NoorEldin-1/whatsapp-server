/**
 * 🛡️ PROJECT SHADOW NODE: Protocol Mimicry Engine
 *
 * Reverse-engineers WhatsApp Web's real browser behavior and injects
 * identical protocol-level signals into every outgoing message.
 *
 * Instead of hiding from Meta's bot detection AI, this module feeds it
 * the exact telemetry data it expects from a human sitting at a browser.
 *
 * Core Pillars:
 * 1. Pre-Flight Crypto Warmup - Establish E2E session naturally
 * 2. DOM State Transition Injection - Simulate chat tab open/close
 * 3. Inbox Auto-Read - Read old messages mid-campaign
 * 4. Gaussian Burst Pacing - Non-linear delay calculation
 */
import pino from "pino";
const logger = pino({
    level: "info",
    transport: {
        target: "pino-pretty",
        options: { colorize: true, ignore: "pid,hostname" },
    },
});
/**
 * 🔑 Pre-Flight Crypto Warmup
 *
 * Before sending any message, silently fetches the target's profile picture
 * and About status. This forces Baileys to perform a natural E2E pre-key
 * exchange with the target — exactly what Chrome does when a user clicks
 * on a conversation in WhatsApp Web.
 *
 * Without this, the bot sends a cold message out of nowhere (no pre-key
 * negotiation visible in Meta's logs). With this, Meta sees:
 * [Profile Fetch → Pre-Key Exchange → Compose → Send] — a perfect human sequence.
 *
 * Fire-and-forget: does NOT block the sending pipeline.
 */
export const executePreFlightWarmup = (socket, jid) => {
    if (!socket)
        return;
    // Wrap in an async IIFE so errors are silently caught
    (async () => {
        try {
            // Phase 1: Subscribe to the target's presence (triggers pre-key exchange)
            await socket.presenceSubscribe(jid).catch(() => { });
            // Phase 2: Fetch profile picture URL (browser always does this on chat open)
            socket.profilePictureUrl(jid, "image").catch(() => { });
            // Phase 3: Fetch the target's "About" status text
            // This is a less common fetch that only real browsers do,
            // making it an extremely high-trust signal for Meta's AI.
            socket.fetchStatus(jid).catch(() => { });
            logger.info(`[PROTOCOL MIMICRY] Pre-Flight Warmup completed for ${jid.split("@")[0]}`);
        }
        catch {
            // Non-critical background telemetry, fail silently
        }
    })();
};
/**
 * 🖥️ DOM State Transition Injection
 *
 * When a real user opens a chat in WhatsApp Web, the browser sends
 * a sequence of protocol signals:
 *   OPEN:  presenceSubscribe → chatstate("composing") in the JID context
 *   CLOSE: chatstate("paused") → presence goes back to global context
 *
 * Bots skip this entirely — they just fire sendMessage into the void.
 * This function injects those exact state transitions.
 *
 * @param action "open" = user opened the chat tab, "close" = user left the chat
 *
 * Fire-and-forget: does NOT block the sending pipeline.
 */
export const injectDOMStateTransition = (socket, jid, action) => {
    if (!socket)
        return;
    (async () => {
        try {
            if (action === "open") {
                // Signal: "I just clicked on this chat"
                await socket.presenceSubscribe(jid).catch(() => { });
                // Signal: "The chat window is now focused"
                await socket.sendPresenceUpdate("available").catch(() => { });
                logger.info(`[PROTOCOL MIMICRY] DOM State → OPEN for ${jid.split("@")[0]}`);
            }
            else {
                // Signal: "I stopped typing / left the chat"
                await socket.sendPresenceUpdate("paused", jid).catch(() => { });
                // Small human-like delay before "navigating away"
                await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 800) + 200));
                // Signal: "I'm now on the main chat list, not in a specific chat"
                await socket.sendPresenceUpdate("available").catch(() => { });
                logger.info(`[PROTOCOL MIMICRY] DOM State → CLOSE for ${jid.split("@")[0]}`);
            }
        }
        catch {
            // Non-critical, fail silently
        }
    })();
};
/**
 * 📬 Inbox Auto-Read Engine
 *
 * The most damning behavioral signal of a bot is: it ONLY SENDS, never READS.
 * A real human constantly checks their inbox, reads replies, and scrolls
 * through old conversations.
 *
 * This function randomly picks 1-3 chats from the session's existing
 * chat cache and sends "read" receipts for them. This tells Meta:
 * "This user is actively reading their messages, not just blasting."
 *
 * Should be called with ~20% probability after each message send.
 *
 * Fire-and-forget: does NOT block the sending pipeline.
 *
 * @param socket The active WASocket
 * @param chats The session's cached chats map (jid → name)
 */
export const executeInboxAutoRead = (socket, chats) => {
    if (!socket || chats.size === 0)
        return;
    (async () => {
        try {
            // Convert chat keys to array and filter to personal chats only
            const personalChats = Array.from(chats.keys()).filter((jid) => jid.includes("@s.whatsapp.net") &&
                !jid.includes("@g.us") &&
                !jid.includes("@newsletter"));
            if (personalChats.length === 0)
                return;
            // Pick 1-3 random chats to "read"
            const readCount = Math.min(personalChats.length, Math.floor(Math.random() * 3) + 1);
            for (let i = 0; i < readCount; i++) {
                const randomJid = personalChats[Math.floor(Math.random() * personalChats.length)];
                // Send a read receipt for the chat
                // This tells WhatsApp servers we "opened and read" this chat
                await socket
                    .readMessages([
                    {
                        remoteJid: randomJid,
                        id: "dummy", // Baileys gracefully handles non-existent message IDs
                        fromMe: false,
                    },
                ])
                    .catch(() => { });
                // Brief human-like pause between reading different chats
                await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 1500) + 500));
            }
            logger.info(`[PROTOCOL MIMICRY] Inbox Auto-Read: Marked ${readCount} chat(s) as read`);
        }
        catch {
            // Non-critical, fail silently
        }
    })();
};
/**
 * 📊 Gaussian Burst Pacing Algorithm (Box-Muller Transform)
 *
 * Standard campaign delay: send every N seconds (linear, predictable, robotic).
 * Human behavior: burst 5 messages fast → long pause → 3 messages → short pause.
 *
 * This function uses a Gaussian (Normal) distribution to calculate
 * a delay that clusters messages into natural-looking bursts.
 *
 * The distribution is centered around `meanDelayMs` with spread `stdDevMs`.
 * Results are clamped between `minDelayMs` and `maxDelayMs`.
 *
 * @param meanDelayMs Center of the bell curve (default: 8000ms = 8s)
 * @param stdDevMs Spread of the curve (default: 5000ms = 5s)
 * @param minDelayMs Floor clamp (default: 1500ms = 1.5s)
 * @param maxDelayMs Ceiling clamp (default: 25000ms = 25s)
 * @returns Delay in milliseconds following a Gaussian distribution
 */
export const calculateGaussianDelay = (meanDelayMs = 8000, stdDevMs = 5000, minDelayMs = 1500, maxDelayMs = 25000) => {
    // Box-Muller Transform: converts two uniform random numbers into
    // a normally distributed random number
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    // Scale and shift to our desired mean and standard deviation
    const gaussianValue = z0 * stdDevMs + meanDelayMs;
    // Clamp to prevent absurdly short or long delays
    return Math.max(minDelayMs, Math.min(maxDelayMs, Math.round(gaussianValue)));
};
//# sourceMappingURL=protocolMimicry.js.map