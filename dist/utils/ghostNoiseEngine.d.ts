import { WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
/**
 * Fires background noise to emulate opening a chat.
 * This function should NOT trigger `await` in the main execution flow.
 * It strictly uses fire-and-forget to prevent any delays.
 *
 * Emulates:
 * 1. Subscribing to presence (seeing if the user is online)
 * 2. Fetching the profile picture (browsers often do this when a chat is opened)
 */
export declare const simulateChatOpenNoise: (socket: WASocket | null, jid: string) => void;
/**
 * 🦅 PROJECT VALKYRIE: Quantum Presence Oscillation (The Nervous User)
 * Bypasses Meta's Bot Detection Heuristics by generating radically chaotic
 * and unpredictable presence states locally and remotely over time.
 * A bot is either always online or always strictly offline. A human user
 * frequently opens the app, types, pauses, records voice notes, deletes them,
 * and leaves the app. This emulator runs entirely asynchronously in the background.
 */
export declare const simulateQuantumPresence: (socket: WASocket | null, jid: string) => Promise<void>;
/**
 * Starts a background loop that randomly selects cached chats
 * and performs presence checks to emulate a user scrolling through their WhatsApp Web.
 *
 * @param sessionId The ID of the session
 * @param socket The active WASocket
 * @param chats The Map of cached chats (JID -> Name)
 * @param sessionLogger The logger for this specific session
 * @returns A NodeJS.Timeout interval that can be cleared on disconnect
 */
export declare const startBackgroundNoiseLoop: (sessionId: string, socket: WASocket, chats: Map<string, string>, sessionLogger: pino.Logger) => NodeJS.Timeout;
/**
 * INCEPTION ROUTING: Ghost App-State Sync
 * Overwhelms WhatsApp's heuristic AI by sending background synchronization requests
 * (e.g., claiming to sync privacy settings, mute statuses, or archive history)
 * right before or during a bulk sending operation.
 *
 * To Meta's servers, this looks identical to an official mobile app initiating
 * an app-state sync cycle, proving the client is a "heavy legitimate consumer"
 * rather than a blind sending script.
 *
 * @param socket The active WASocket
 */
export declare const triggerGhostSync: (socket: WASocket | null) => void;
/**
 * 🌌 PROJECT AETHER: VoIP WebRTC Fakeout
 * Sends a fleeting, raw XML audio call offer to the target and immediately revokes it
 * before their phone can even ring. This forces the VoIP nodes to register a
 * "Call Attempt" between the sender and receiver, artificially inflating the
 * Web of Trust score right before a text message is sent.
 */
export declare const executeVoIPWebRTCFakeout: (socket: WASocket | null, jid: string) => Promise<void>;
/**
 * 🌌 PROJECT AETHER: Ghost Status Empathy
 * Emulates the psychological behavior of a user viewing the target's WhatsApp Status (Story)
 * right before messaging them. This establishes an empathetic human sequence in Meta's logs:
 * [View Status -> Write Message -> Send].
 */
export declare const emulateGhostStatusView: (socket: WASocket | null, jid: string) => Promise<void>;
//# sourceMappingURL=ghostNoiseEngine.d.ts.map