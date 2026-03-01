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
import pino from "pino";

const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true, ignore: "pid,hostname" },
  },
});

/**
 * Curated pool of realistic React/DOM errors that WhatsApp Web genuinely
 * throws in production Chrome sessions. Collected via reverse-engineering
 * the minified JS bundle of web.whatsapp.com.
 */
const REALISTIC_BROWSER_ERRORS: string[] = [
  "TypeError: Cannot read properties of null (reading 'scrollIntoView')",
  "TypeError: Cannot read properties of undefined (reading 'querySelector')",
  "RangeError: Maximum call stack size exceeded",
  "DOMException: Failed to execute 'removeChild' on 'Node': not a child",
  "TypeError: Cannot set properties of null (setting 'textContent')",
  "NotFoundError: Failed to execute 'insertBefore' on 'Node'",
  "TypeError: e.getBoundingClientRect is not a function",
  "AbortError: The play() request was interrupted by a call to pause()",
  "TypeError: Cannot read properties of undefined (reading 'mediaKey')",
  "QuotaExceededError: Failed to execute 'setItem' on 'Storage': quota exceeded",
  "TypeError: Cannot read properties of null (reading 'classList')",
  "TypeError: Failed to fetch",
  "DOMException: The operation is insecure (IndexedDB)",
  "TypeError: Cannot read properties of undefined (reading 'fromMe')",
  "InvalidStateError: Failed to read the 'result' property from 'IDBRequest'",
];

/**
 * Realistic performance metric ranges for a Chrome browser running
 * WhatsApp Web on a mid-range Windows/Mac laptop.
 */
const PERF_METRICS = {
  jsHeapUsedMin: 45_000_000, // 45 MB
  jsHeapUsedMax: 380_000_000, // 380 MB (WA Web is very heavy)
  jsHeapTotalMin: 80_000_000, // 80 MB
  jsHeapTotalMax: 512_000_000, // 512 MB
  domNodesMin: 3500,
  domNodesMax: 18000,
  frameDropMin: 0,
  frameDropMax: 12,
};

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
export const injectFakeReactError = (
  socket: WASocket | null,
  sessionId: string,
): void => {
  if (!socket) return;

  (async () => {
    try {
      // Pick a random error from the pool
      const errorMsg =
        REALISTIC_BROWSER_ERRORS[
          Math.floor(Math.random() * REALISTIC_BROWSER_ERRORS.length)
        ];

      // Generate realistic performance metrics
      const heapUsed =
        Math.floor(
          Math.random() *
            (PERF_METRICS.jsHeapUsedMax - PERF_METRICS.jsHeapUsedMin),
        ) + PERF_METRICS.jsHeapUsedMin;
      const heapTotal = Math.max(
        heapUsed + 20_000_000,
        Math.floor(
          Math.random() *
            (PERF_METRICS.jsHeapTotalMax - PERF_METRICS.jsHeapTotalMin),
        ) + PERF_METRICS.jsHeapTotalMin,
      );
      const domNodes =
        Math.floor(
          Math.random() * (PERF_METRICS.domNodesMax - PERF_METRICS.domNodesMin),
        ) + PERF_METRICS.domNodesMin;
      const droppedFrames =
        Math.floor(
          Math.random() *
            (PERF_METRICS.frameDropMax - PERF_METRICS.frameDropMin),
        ) + PERF_METRICS.frameDropMin;

      // Send error telemetry via w:stats (the official channel WA Web uses)
      await socket
        .query({
          tag: "iq",
          attrs: {
            to: "@s.whatsapp.net",
            type: "set",
            xmlns: "w:stats",
          },
          content: [
            {
              tag: "add",
              attrs: {},
              content: [
                {
                  tag: "error",
                  attrs: {
                    type: "dom_exception",
                    message: errorMsg,
                    stack: `at Object.render (app2.${Math.random().toString(36).substring(2, 8)}.js:${Math.floor(Math.random() * 50000) + 1000}:${Math.floor(Math.random() * 200) + 1})`,
                    count: (Math.floor(Math.random() * 3) + 1).toString(),
                    ts: Math.floor(Date.now() / 1000).toString(),
                  },
                },
                {
                  tag: "perf",
                  attrs: {
                    js_heap_used: heapUsed.toString(),
                    js_heap_total: heapTotal.toString(),
                    dom_nodes: domNodes.toString(),
                    dropped_frames: droppedFrames.toString(),
                  },
                },
              ],
            },
          ],
        })
        .catch(() => {});

      logger.info(
        `[LIVING MIRAGE] Diagnostic Bribe sent for ${sessionId}: "${errorMsg.substring(0, 50)}..."`,
      );
    } catch {
      // Non-critical, fail silently
    }
  })();
};

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
export const startTabLifecycleOscillator = (
  socket: WASocket | null,
  sessionId: string,
): NodeJS.Timeout | null => {
  if (!socket) return null;

  // State machine: tracks the current "tab" state
  let currentState: "visible" | "hidden" | "blurred" = "visible";

  const oscillate = async () => {
    try {
      if (!socket.ws || !(socket.ws as any).isOpen) return;

      // 40% chance to skip this cycle (irregular human behavior)
      if (Math.random() < 0.4) return;

      // State transition logic
      if (currentState === "visible") {
        // User switches to another tab or minimizes
        const nextState = Math.random() > 0.5 ? "hidden" : "blurred";
        currentState = nextState;

        // Send "tab is now hidden" telemetry
        await socket
          .query({
            tag: "iq",
            attrs: {
              to: "@s.whatsapp.net",
              type: "set",
              xmlns: "w:stats",
            },
            content: [
              {
                tag: "add",
                attrs: {},
                content: [
                  {
                    tag: "web",
                    attrs: {
                      visibility: nextState,
                      focus: "false",
                      ts: Math.floor(Date.now() / 1000).toString(),
                    },
                  },
                ],
              },
            ],
          })
          .catch(() => {});

        // Mark as unavailable (user is in another tab)
        await socket.sendPresenceUpdate("unavailable").catch(() => {});

        logger.info(
          `[LIVING MIRAGE] Tab → ${nextState.toUpperCase()} for ${sessionId}`,
        );
      } else {
        // User returns to WhatsApp tab
        currentState = "visible";

        await socket
          .query({
            tag: "iq",
            attrs: {
              to: "@s.whatsapp.net",
              type: "set",
              xmlns: "w:stats",
            },
            content: [
              {
                tag: "add",
                attrs: {},
                content: [
                  {
                    tag: "web",
                    attrs: {
                      visibility: "visible",
                      focus: "true",
                      ts: Math.floor(Date.now() / 1000).toString(),
                    },
                  },
                ],
              },
            ],
          })
          .catch(() => {});

        // Mark as available (user is back)
        await socket.sendPresenceUpdate("available").catch(() => {});

        logger.info(`[LIVING MIRAGE] Tab → VISIBLE for ${sessionId}`);
      }
    } catch {
      // Non-critical, fail silently
    }
  };

  // Oscillate every 3-8 minutes (random interval per cycle)
  const intervalMs =
    Math.floor(Math.random() * (8 - 3 + 1) * 60 * 1000) + 3 * 60 * 1000;
  return setInterval(oscillate, intervalMs);
};

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
export const emitPhantomScrollTelemetry = (
  socket: WASocket | null,
  jid: string,
): void => {
  if (!socket) return;

  (async () => {
    try {
      // Random scroll depth (0 = top, messages scrolled up)
      const scrollDepth = Math.floor(Math.random() * 50) + 5;
      // Number of messages currently "visible" on screen
      const visibleMessages = Math.floor(Math.random() * 12) + 4;

      await socket
        .query({
          tag: "iq",
          attrs: {
            to: "@s.whatsapp.net",
            type: "set",
            xmlns: "w:stats",
          },
          content: [
            {
              tag: "add",
              attrs: {},
              content: [
                {
                  tag: "interaction",
                  attrs: {
                    type: "scroll",
                    chat: jid,
                    depth: scrollDepth.toString(),
                    visible_count: visibleMessages.toString(),
                    direction: Math.random() > 0.3 ? "up" : "down",
                    ts: Math.floor(Date.now() / 1000).toString(),
                  },
                },
              ],
            },
          ],
        })
        .catch(() => {});

      logger.info(
        `[LIVING MIRAGE] Phantom Scroll (depth=${scrollDepth}) in ${jid.split("@")[0]}`,
      );
    } catch {
      // Non-critical, fail silently
    }
  })();
};

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
export const calculateCpuThrottleJitter = (messagesSent: number): number => {
  // Base latency: 20-80ms (light browser)
  let baseLatency = Math.floor(Math.random() * 60) + 20;

  // Progressive CPU exhaustion: every 50 messages adds 10-30ms of "browser lag"
  const exhaustionFactor = Math.floor(messagesSent / 50);
  const exhaustionDelay =
    exhaustionFactor * (Math.floor(Math.random() * 20) + 10);

  // Cap the exhaustion at 300ms (Chrome would crash beyond this)
  const totalBase = Math.min(baseLatency + exhaustionDelay, 300);

  // 10% chance of a severe GC (Garbage Collection) pause: 400-1500ms
  // This mimics Chrome's V8 engine doing a Major GC sweep
  if (Math.random() < 0.1) {
    return totalBase + Math.floor(Math.random() * 1100) + 400;
  }

  // 5% chance of a minor GC pause: 150-400ms
  if (Math.random() < 0.05) {
    return totalBase + Math.floor(Math.random() * 250) + 150;
  }

  return totalBase;
};

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
export const startDiagnosticScheduler = (
  socket: WASocket | null,
  sessionId: string,
): NodeJS.Timeout | null => {
  if (!socket) return null;

  // Fire the first one after 2-5 minutes
  setTimeout(
    () => injectFakeReactError(socket, sessionId),
    Math.floor(Math.random() * (5 - 2 + 1) * 60 * 1000) + 2 * 60 * 1000,
  );

  // Then fire every 10-25 minutes
  const intervalMs =
    Math.floor(Math.random() * (25 - 10 + 1) * 60 * 1000) + 10 * 60 * 1000;

  return setInterval(() => injectFakeReactError(socket, sessionId), intervalMs);
};
