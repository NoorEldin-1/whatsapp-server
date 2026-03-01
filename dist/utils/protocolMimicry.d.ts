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
import { WASocket } from "@whiskeysockets/baileys";
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
export declare const executePreFlightWarmup: (socket: WASocket | null, jid: string) => void;
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
export declare const injectDOMStateTransition: (socket: WASocket | null, jid: string, action: "open" | "close") => void;
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
export declare const executeInboxAutoRead: (socket: WASocket | null, chats: Map<string, string>) => void;
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
export declare const calculateGaussianDelay: (meanDelayMs?: number, stdDevMs?: number, minDelayMs?: number, maxDelayMs?: number) => number;
//# sourceMappingURL=protocolMimicry.d.ts.map