/**
 * 🛡️ PROJECT OUROBOROS: Primary Device Hallucination Engine
 *
 * Reverse-engineers WhatsApp's Multi-Device (MD) architecture to
 * convince Meta that a real, physical iPhone/Android is paired
 * with this "WhatsApp Web" session. Bots are always single-node
 * connections — no battery, no history requests, no network roaming.
 *
 * Core Functions:
 * 1. startBatteryLifecycle — Virtual battery drain/charge simulation
 * 2. triggerPhantomHistorySync — Request old messages to appear "heavy"
 * 3. startPushNameEphemerality — Rotate identity to flush spam caches
 * 4. emitNetworkRoamingSignal — Fake Wi-Fi ↔ Cellular transitions
 */
import { WASocket } from "@whiskeysockets/baileys";
/**
 * 🔋 Virtual Battery Lifecycle (Drain & Charge State Machine)
 *
 * WhatsApp Web requests battery info from the primary phone.
 * Bots never report battery, or report a static 100% forever.
 * Meta's AI flags this as a cloud server.
 *
 * This function creates a virtual battery that:
 * - Starts at 60-90% (random)
 * - Drains ~1% every 20-40 minutes
 * - At 15-25%, "plugs in" and charges to 95-100%
 * - Then unplugs and drains again
 *
 * Battery telemetry is sent via `w:stats` IQ stanzas.
 *
 * @param socket The active WASocket
 * @param sessionId For logging and state tracking
 * @returns NodeJS.Timeout for cleanup
 */
export declare const startBatteryLifecycle: (socket: WASocket | null, sessionId: string) => NodeJS.Timeout | null;
/**
 * 📜 Phantom History Sync (The Blackhole)
 *
 * When a real user opens WhatsApp Web, it constantly requests
 * old chat history from the phone in chunks. API bots sync once
 * at connection and never again — Meta flags this silence.
 *
 * This function sends a fake "give me more old messages" request
 * to Meta's servers. The response data is dropped immediately
 * (we don't process it) to save memory, but the REQUEST itself
 * signals to Meta's AI: "this is a real user scrolling through
 * old conversations."
 *
 * Should fire every 15-45 minutes via a background scheduler.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 */
export declare const triggerPhantomHistorySync: (socket: WASocket | null, sessionId: string) => void;
/**
 * 🏷️ Push-Name Ephemerality (Identity Cache Buster)
 *
 * Bot accounts set their profile name once and never change it.
 * Meta's routing nodes cache account metadata aggressively.
 * By subtly altering the push name with invisible characters,
 * we force Meta's CDN to flush/invalidate its cached spam
 * scoring for our number.
 *
 * The change is invisible: "Zender" → "Zender\u200B" → "Zender"
 * (toggling a zero-width space).
 *
 * Runs every 4-8 hours via a background scheduler.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 * @param originalName The account's real display name
 * @returns NodeJS.Timeout for cleanup
 */
export declare const startPushNameEphemerality: (socket: WASocket | null, sessionId: string, originalName: string) => NodeJS.Timeout | null;
/**
 * 📡 Network Roaming Signal Emitter (Wi-Fi ↔ Cellular)
 *
 * Server-hosted bots have a perfectly stable, static IP connection.
 * Real phones constantly transition between Wi-Fi and mobile data
 * (4G/5G). Meta monitors these transitions via ClientPayload.
 *
 * This function emits a fake "network changed" signal to Meta
 * via the protocol, as if the user's phone just switched from
 * Wi-Fi to Cellular or vice versa.
 *
 * Should fire every 30-90 minutes randomly.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 */
export declare const emitNetworkRoamingSignal: (socket: WASocket | null, sessionId: string) => void;
/**
 * 🎛️ Master Scheduler for History Sync & Network Roaming
 *
 * Combines the periodic History Sync requests and Network Roaming
 * signals into a single background scheduler for clean lifecycle.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 * @returns NodeJS.Timeout for cleanup
 */
export declare const startOuroborosScheduler: (socket: WASocket | null, sessionId: string) => NodeJS.Timeout | null;
/**
 * Cleanup battery state for a disconnected session.
 * @param sessionId The session to clean up
 */
export declare const cleanupBatteryState: (sessionId: string) => void;
//# sourceMappingURL=ouroborosEngine.d.ts.map