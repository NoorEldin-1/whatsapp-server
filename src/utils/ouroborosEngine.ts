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
import pino from "pino";

const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true, ignore: "pid,hostname" },
  },
});

/**
 * Internal state for the virtual battery simulation.
 * Each session gets its own battery state instance.
 */
interface BatteryState {
  level: number; // 0-100
  plugged: boolean; // Whether "charging"
  intervalId: NodeJS.Timeout;
}

/** Active battery states per session */
const batteryStates = new Map<string, BatteryState>();

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
export const startBatteryLifecycle = (
  socket: WASocket | null,
  sessionId: string,
): NodeJS.Timeout | null => {
  if (!socket) return null;

  // Initialize with realistic starting battery
  const initialLevel = Math.floor(Math.random() * 31) + 60; // 60-90%
  const state: BatteryState = {
    level: initialLevel,
    plugged: false,
    intervalId: null as unknown as NodeJS.Timeout,
  };

  const tick = async () => {
    try {
      if (!socket.ws || !(socket.ws as any).isOpen) return;

      if (state.plugged) {
        // Charging: gain 2-5% per tick
        state.level = Math.min(
          100,
          state.level + Math.floor(Math.random() * 4) + 2,
        );

        // Unplug at 95-100%
        if (state.level >= 95 + Math.floor(Math.random() * 6)) {
          state.plugged = false;
          logger.info(
            `[OUROBOROS] Battery UNPLUGGED at ${state.level}% for ${sessionId}`,
          );
        }
      } else {
        // Draining: lose 1-2% per tick
        state.level = Math.max(
          0,
          state.level - Math.floor(Math.random() * 2) - 1,
        );

        // Plug in at 15-25% (human puts phone on charger)
        if (state.level <= 15 + Math.floor(Math.random() * 11)) {
          state.plugged = true;
          logger.info(
            `[OUROBOROS] Battery PLUGGED IN at ${state.level}% for ${sessionId}`,
          );
        }
      }

      // Send battery telemetry via w:stats
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
                  tag: "battery",
                  attrs: {
                    level: state.level.toString(),
                    plugged: state.plugged ? "1" : "0",
                    powersave: state.level < 20 ? "1" : "0",
                    ts: Math.floor(Date.now() / 1000).toString(),
                  },
                },
              ],
            },
          ],
        })
        .catch(() => {});

      logger.info(
        `[OUROBOROS] Battery: ${state.level}% ${state.plugged ? "⚡" : "🔋"} for ${sessionId}`,
      );
    } catch {
      // Non-critical, fail silently
    }
  };

  // Tick every 20-40 minutes (drain/charge cycle)
  const intervalMs =
    Math.floor(Math.random() * (40 - 20 + 1) * 60 * 1000) + 20 * 60 * 1000;

  // Fire first tick after 1-3 minutes
  setTimeout(tick, Math.floor(Math.random() * 2 * 60 * 1000) + 60 * 1000);

  state.intervalId = setInterval(tick, intervalMs);
  batteryStates.set(sessionId, state);

  logger.info(
    `[OUROBOROS] Battery Lifecycle started at ${initialLevel}% for ${sessionId}`,
  );

  return state.intervalId;
};

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
export const triggerPhantomHistorySync = (
  socket: WASocket | null,
  sessionId: string,
): void => {
  if (!socket) return;

  (async () => {
    try {
      // Generate a fake "last message timestamp" from 6-18 months ago
      const monthsAgo = Math.floor(Math.random() * 13) + 6;
      const fakeTimestamp = Math.floor(
        (Date.now() - monthsAgo * 30 * 24 * 60 * 60 * 1000) / 1000,
      );

      // Request history sync chunk (we'll silently drop the response)
      await socket
        .query({
          tag: "iq",
          attrs: {
            to: "@s.whatsapp.net",
            type: "set",
            xmlns: "w:sync:app:state",
          },
          content: [
            {
              tag: "sync",
              attrs: {},
              content: [
                {
                  tag: "collection",
                  attrs: {
                    name: "regular_high",
                    version: Math.floor(Math.random() * 50 + 10).toString(),
                    return_snapshot: "false",
                  },
                },
              ],
            },
          ],
        })
        .catch(() => {});

      logger.info(
        `[OUROBOROS] History Sync requested (${monthsAgo} months ago) for ${sessionId}`,
      );
    } catch {
      // Non-critical, fail silently
    }
  })();
};

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
export const startPushNameEphemerality = (
  socket: WASocket | null,
  sessionId: string,
  originalName: string,
): NodeJS.Timeout | null => {
  if (!socket || !originalName) return null;

  let isToggled = false;

  const rotate = async () => {
    try {
      if (!socket.ws || !(socket.ws as any).isOpen) return;

      // Toggle: add or remove a zero-width space at the end
      const newName = isToggled ? originalName : originalName + "\u200B"; // Zero-Width Space

      await socket.updateProfileName(newName).catch(() => {});
      isToggled = !isToggled;

      logger.info(
        `[OUROBOROS] Push-Name rotated ${isToggled ? "(+ZWS)" : "(clean)"} for ${sessionId}`,
      );
    } catch {
      // Non-critical, fail silently
    }
  };

  // Rotate every 4-8 hours
  const intervalMs =
    Math.floor(Math.random() * (8 - 4 + 1) * 60 * 60 * 1000) +
    4 * 60 * 60 * 1000;

  // First rotation after 30-60 minutes
  setTimeout(
    rotate,
    Math.floor(Math.random() * 30 * 60 * 1000) + 30 * 60 * 1000,
  );

  return setInterval(rotate, intervalMs);
};

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
export const emitNetworkRoamingSignal = (
  socket: WASocket | null,
  sessionId: string,
): void => {
  if (!socket) return;

  (async () => {
    try {
      const networkTypes = [
        "wifi",
        "cellular",
        "wifi_5ghz",
        "cellular_4g",
        "cellular_5g",
      ];
      const currentNetwork =
        networkTypes[Math.floor(Math.random() * networkTypes.length)];

      // Simulate realistic signal strength based on network type
      const signalStrength = currentNetwork.startsWith("wifi")
        ? Math.floor(Math.random() * 30) + 70 // Wi-Fi: 70-100%
        : Math.floor(Math.random() * 40) + 40; // Cellular: 40-80%

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
                  tag: "network",
                  attrs: {
                    type: currentNetwork,
                    signal: signalStrength.toString(),
                    roaming: Math.random() < 0.05 ? "1" : "0", // 5% roaming
                    ts: Math.floor(Date.now() / 1000).toString(),
                  },
                },
              ],
            },
          ],
        })
        .catch(() => {});

      logger.info(
        `[OUROBOROS] Network Roaming: ${currentNetwork} (${signalStrength}%) for ${sessionId}`,
      );
    } catch {
      // Non-critical, fail silently
    }
  })();
};

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
export const startOuroborosScheduler = (
  socket: WASocket | null,
  sessionId: string,
): NodeJS.Timeout | null => {
  if (!socket) return null;

  const tick = () => {
    // 50% chance: trigger history sync request
    if (Math.random() < 0.5) {
      triggerPhantomHistorySync(socket, sessionId);
    }

    // 40% chance: emit network roaming signal
    if (Math.random() < 0.4) {
      emitNetworkRoamingSignal(socket, sessionId);
    }
  };

  // Fire every 20-50 minutes
  const intervalMs =
    Math.floor(Math.random() * (50 - 20 + 1) * 60 * 1000) + 20 * 60 * 1000;

  // First tick after 5-10 minutes
  setTimeout(tick, Math.floor(Math.random() * 5 * 60 * 1000) + 5 * 60 * 1000);

  return setInterval(tick, intervalMs);
};

/**
 * Cleanup battery state for a disconnected session.
 * @param sessionId The session to clean up
 */
export const cleanupBatteryState = (sessionId: string): void => {
  const state = batteryStates.get(sessionId);
  if (state) {
    clearInterval(state.intervalId);
    batteryStates.delete(sessionId);
  }
};
