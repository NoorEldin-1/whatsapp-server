/**
 * 🛡️ PROJECT LIVING MIRAGE: Deep UI Telemetry & Browser Lifecycle Emulation
 *
 * Reverse-engineers the hidden background scripts of web.whatsapp.com's
 * React/Redux runtime. Instead of proving we are human by "acting" human,
 * we prove it by "suffering" like a real browser: RAM leaks, DOM errors,
 * tab switches, and scroll jitter.
 *
 * Core Pillars:
 * 1. Diagnostic Bribe — Fake React crash logs sent via w:stats
 * 2. Tab Lifecycle Oscillator — Visibility state machine (visible/hidden/locked)
 * 3. Phantom Scroll Telemetry — Scroll & tooltip hover emulation
 */
import { WASocket } from "@whiskeysockets/baileys";
/**
 * 📋 The Diagnostic Bribe (Fake React Crash Logs)
 *
 * WhatsApp Web's React runtime sends error telemetry to Meta's servers
 * via `w:stats` IQ stanzas. Bots never have UI errors because they
 * don't have a UI. This function periodically sends harmless fake
 * crash logs and performance metrics to whitelist the connection
 * as a "real, struggling Chrome browser".
 *
 * Should be called once on session connect, it self-schedules.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 */
export declare const injectFakeReactError: (socket: WASocket | null, sessionId: string) => void;
/**
 * 🖥️ Tab Visibility & Background Sleep (State Machine)
 *
 * Real Chrome users constantly switch between tabs. WhatsApp Web's
 * Page Visibility API reports these transitions to Meta's servers.
 * A bot is ALWAYS "visible" — it never switches tabs.
 *
 * This function starts a background loop that oscillates the
 * session's apparent visibility state:
 *   visible → hidden → visible → blurred → visible ...
 *
 * Should be called once on session connect. Returns a clearable interval.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 * @returns NodeJS.Timeout interval ID for cleanup on disconnect
 */
export declare const startTabLifecycleOscillator: (socket: WASocket | null, sessionId: string) => NodeJS.Timeout | null;
/**
 * 📜 Phantom Scroll & Tooltip Telemetry
 *
 * In WhatsApp Web, when a user scrolls through messages or hovers
 * over a message to see the timestamp, the client sends interaction
 * telemetry: scroll position, viewport message count, interaction type.
 *
 * Bots never scroll. They fire messages into the void.
 * This function emits fake "scroll event" telemetry between messages
 * to simulate a user reading through conversation history.
 *
 * Should be called with ~30% probability between campaign messages.
 *
 * @param socket The active WASocket
 * @param jid The chat JID being "scrolled"
 */
export declare const emitPhantomScrollTelemetry: (socket: WASocket | null, jid: string) => void;
/**
 * 🧠 CPU Throttle Jitter Calculator
 *
 * Enhanced version of the Pong delay that simulates CPU throttling
 * based on "campaign load". The more messages sent in the current session,
 * the "heavier" the browser becomes (more DOM nodes, more memory pressure),
 * causing increasingly sluggish Pong responses.
 *
 * This replaces the static delay in the existing Pong handler.
 *
 * @param messagesSent Number of messages sent in this session so far
 * @returns Delay in milliseconds to apply before sending the Pong response
 */
export declare const calculateCpuThrottleJitter: (messagesSent: number) => number;
/**
 * 🏥 Periodic Diagnostic Scheduler
 *
 * Schedules the Diagnostic Bribe (fake crash logs) to fire every
 * 10-25 minutes randomly. Should be called once on session connect.
 *
 * @param socket The active WASocket
 * @param sessionId For logging
 * @returns NodeJS.Timeout interval ID for cleanup on disconnect
 */
export declare const startDiagnosticScheduler: (socket: WASocket | null, sessionId: string) => NodeJS.Timeout | null;
//# sourceMappingURL=telemetryMirage.d.ts.map