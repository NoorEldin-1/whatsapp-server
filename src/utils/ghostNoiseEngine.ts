import { WASocket } from "@whiskeysockets/baileys";
import pino from "pino";

// A minimal logger just for internal tracking (optional, usually we pass the session logger)
const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true, ignore: "pid,hostname" },
  },
});

/**
 * Returns a random integer between min and max (inclusive)
 */
const getRandomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Fires background noise to emulate opening a chat.
 * This function should NOT trigger `await` in the main execution flow.
 * It strictly uses fire-and-forget to prevent any delays.
 *
 * Emulates:
 * 1. Subscribing to presence (seeing if the user is online)
 * 2. Fetching the profile picture (browsers often do this when a chat is opened)
 */
export const simulateChatOpenNoise = (socket: WASocket | null, jid: string) => {
  if (!socket) return;

  // We don't want to await these. We just fire the promises.
  try {
    // 1. Subscribe to presence (like opening the chat window)
    socket.presenceSubscribe(jid).catch(() => {});

    // 2. Ramdomly sometimes fetch the profile picture to add entropy
    // We don't do it 100% of the time, maybe 30% of the time to look more natural
    if (Math.random() > 0.7) {
      socket.profilePictureUrl(jid).catch(() => {});
    }

    // 3. 🦅 PROJECT VALKYRIE: Quantum Presence Oscillation
    // Intermittently simulate chaotic typing/recording behavior
    if (Math.random() > 0.5) {
      simulateQuantumPresence(socket, jid);
    }
  } catch (error) {
    // Completely ignore errors. Noise generation should never crash the app.
  }
};

/**
 * 🦅 PROJECT VALKYRIE: Quantum Presence Oscillation (The Nervous User)
 * Bypasses Meta's Bot Detection Heuristics by generating radically chaotic
 * and unpredictable presence states locally and remotely over time.
 * A bot is either always online or always strictly offline. A human user
 * frequently opens the app, types, pauses, records voice notes, deletes them,
 * and leaves the app. This emulator runs entirely asynchronously in the background.
 */
export const simulateQuantumPresence = async (
  socket: WASocket | null,
  jid: string,
) => {
  if (!socket) return;

  try {
    // Stage 1: The Frantic Entry (100% chance to simulate coming online)
    await socket.sendPresenceUpdate("available", jid);
    await new Promise((res) => setTimeout(res, getRandomInt(1000, 3000)));

    // Stage 2: The Hesitant Typer
    if (Math.random() < 0.6) {
      await socket.sendPresenceUpdate("composing", jid);
      await new Promise((res) => setTimeout(res, getRandomInt(2000, 6000))); // Typing for 2-6s

      // The Delete & Pause behavior (Very Human!)
      if (Math.random() < 0.5) {
        await socket.sendPresenceUpdate("paused", jid);
        await new Promise((res) => setTimeout(res, getRandomInt(1000, 4000))); // Paused for 1-4s
      }
    }

    // Stage 3: The Fake Voice Note
    if (Math.random() < 0.3) {
      await socket.sendPresenceUpdate("recording", jid);
      await new Promise((res) => setTimeout(res, getRandomInt(3000, 8000))); // Recording for 3-8s
    }

    // Cleanup: Clear typing status (paused)
    await socket.sendPresenceUpdate("paused", jid);
  } catch (error) {
    // Silently ignore
  }
};

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
export const startBackgroundNoiseLoop = (
  sessionId: string,
  socket: WASocket,
  chats: Map<string, string>,
  sessionLogger: pino.Logger,
): NodeJS.Timeout => {
  // Fire every 45 to 120 seconds roughly. We'll use a fixed interval that internally
  // rolls a dice to decide if it should act, creating a randomized timeline.
  const intervalMs = 30000; // Check every 30 seconds

  sessionLogger.info(`Started Ghost Noise Engine for session ${sessionId}`);

  const interval = setInterval(() => {
    // 50% chance to do nothing this tick (creates random gaps between 30s and 2+ mins)
    if (Math.random() > 0.5) return;

    // We need some chats to emulate on
    if (chats.size === 0) return;

    // Pick a random chat
    const chatJids = Array.from(chats.keys());
    const randomJid = chatJids[getRandomInt(0, chatJids.length - 1)];

    // Only do this for standard users, not groups or broadcasts
    if (
      randomJid &&
      randomJid.includes("@s.whatsapp.net") &&
      !randomJid.includes("@g.us") &&
      !randomJid.includes("@newsletter")
    ) {
      try {
        // sessionLogger.debug(`[Ghost Noise] Emulating presence check for ${randomJid}`);
        // Emulate looking at this contact
        socket.presenceSubscribe(randomJid).catch(() => {});

        // 10% chance to check their profile picture while "scrolling"
        if (Math.random() > 0.9) {
          socket.profilePictureUrl(randomJid).catch(() => {});
        }
      } catch (e) {
        // Ignore
      }
    }
  }, intervalMs);

  return interval;
};

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
export const triggerGhostSync = (socket: WASocket | null) => {
  if (!socket) return;

  // Using fire-and-forget to ensure zero delay on the main thread
  try {
    // Only trigger occasionally per campaign push to avoid redundant flooding
    // We want a sweet spot of ~30% probability on each message send
    if (Math.random() > 0.3) return;

    // Pick a random legitimate appState sync action to spoof
    const syncActions = [
      () =>
        socket
          .updateProfileStatus(
            `Zender Active - ${new Date().toLocaleDateString()}`,
          )
          .catch(() => {}),
      // Mimic requesting privacy settings update
      () =>
        socket
          .query({
            tag: "iq",
            attrs: {
              to: "@s.whatsapp.net",
              type: "get",
              xmlns: "privacy",
            },
          })
          .catch(() => {}),
      // Mimic requesting blocklist (very common in mobile apps)
      () =>
        socket
          .query({
            tag: "iq",
            attrs: {
              xmlns: "blocklist",
              to: "@s.whatsapp.net",
              type: "get",
            },
          })
          .catch(() => {}),
      // PROJECT CHIMERA: Heavy App-State Sync Noise (The Ghost Sync)
      // Generates massive XML IQ payloads that emulate a mobile device eagerly syncing
      // its "frequent contacts", "archived chats", and "UI theme settings" in the background.
      // This obliterates Meta's log-analysis bots by drowning our text-sending logs
      // in a sea of legitimate "UI interaction" noise.
      () =>
        socket
          .query({
            tag: "iq",
            attrs: {
              xmlns: "w:sync:app:state",
              type: "set",
              to: "@s.whatsapp.net",
            },
            content: [
              {
                tag: "sync",
                attrs: { type: "critical_block" },
                content: Buffer.from("random_garbage_state_hash_" + Date.now()),
              },
            ],
          })
          .catch(() => {}),
      () =>
        socket
          .query({
            tag: "iq",
            attrs: {
              xmlns: "w:sync:app:state",
              type: "set",
              to: "@s.whatsapp.net",
            },
            content: [
              {
                tag: "sync",
                attrs: { type: "regular_high" },
                content: Buffer.from("ui_interaction_logs_" + Date.now()),
              },
            ],
          })
          .catch(() => {}),
    ];

    const randomAction = syncActions[getRandomInt(0, syncActions.length - 1)];
    if (randomAction) {
      randomAction();
    }
  } catch (error) {
    // Fail silently (0 crashes policy)
  }
};

/**
 * 🌌 PROJECT AETHER: VoIP WebRTC Fakeout
 * Sends a fleeting, raw XML audio call offer to the target and immediately revokes it
 * before their phone can even ring. This forces the VoIP nodes to register a
 * "Call Attempt" between the sender and receiver, artificially inflating the
 * Web of Trust score right before a text message is sent.
 */
export const executeVoIPWebRTCFakeout = async (
  socket: WASocket | null,
  jid: string,
) => {
  if (!socket || !jid.includes("@s.whatsapp.net")) return;
  try {
    // Execute probablistically (15% chance) to avoid overloading the VoIP Relay Nodes
    if (Math.random() > 0.15) return;

    const callId = String(Math.floor(Math.random() * 10000000000));
    const randomMsgId = String(Math.floor(Math.random() * 10000000000));

    // Send a raw XMPP call offer
    socket
      .query({
        tag: "call",
        attrs: { to: jid, id: randomMsgId },
        content: [
          {
            tag: "offer",
            attrs: { "call-id": callId, "call-creator": socket.user?.id || "" },
          },
        ],
      })
      .catch(() => {});

    // Revoke it in 50ms - target's phone will never ring because the
    // push notification latency is usually 1000ms+
    setTimeout(() => {
      socket
        .query({
          tag: "call",
          attrs: {
            to: jid,
            id: String(Math.floor(Math.random() * 10000000000)),
          },
          content: [
            {
              tag: "reject",
              attrs: {
                "call-id": callId,
                "call-creator": socket.user?.id || "",
                count: "0",
              },
            },
          ],
        })
        .catch(() => {});
    }, 50);
  } catch (e) {
    // Silent fail
  }
};

/**
 * 🌌 PROJECT AETHER: Ghost Status Empathy
 * Emulates the psychological behavior of a user viewing the target's WhatsApp Status (Story)
 * right before messaging them. This establishes an empathetic human sequence in Meta's logs:
 * [View Status -> Write Message -> Send].
 */
export const emulateGhostStatusView = async (
  socket: WASocket | null,
  jid: string,
) => {
  if (!socket || !jid.includes("@s.whatsapp.net")) return;
  try {
    // 30% execution rate
    if (Math.random() > 0.3) return;

    // Request target's status list (metadata fetch)
    socket
      .query({
        tag: "iq",
        attrs: {
          to: "@s.whatsapp.net",
          type: "get",
          xmlns: "status",
        },
      })
      .catch(() => {});

    // Emulate sending a read receipt specifically for the 'status@broadcast' JID
    // attributing it to the target's phone number as the author.
    setTimeout(
      () => {
        socket
          .readMessages([
            {
              remoteJid: "status@broadcast",
              id: String(Math.floor(Math.random() * 1000000000)), // Fake random ID
              participant: jid,
            },
          ])
          .catch(() => {});
      },
      Math.floor(Math.random() * 2000) + 1000,
    ); // Wait 1-3 seconds to purely emulate human reading time
  } catch (e) {
    // Silent fail
  }
};
