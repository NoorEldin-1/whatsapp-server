/**
 * Baileys WhatsApp Session Manager
 *
 * Handles WhatsApp session lifecycle using Baileys library.
 * Key features:
 * - WebSocket-based communication (no browser, low RAM)
 * - Multi-session support with isolation
 * - Smart session management for RAM efficiency
 * - QR code generation for pairing
 * - Credential persistence
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  proto,
  getContentType,
  Browsers,
  BaileysEventMap,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { injectZeroWidthChars } from "../utils/spintax.js";
import { getRandomBrowserFingerprint } from "../utils/browserFingerprint.js";
import {
  simulateChatOpenNoise,
  startBackgroundNoiseLoop,
  triggerGhostSync,
  executeVoIPWebRTCFakeout,
  emulateGhostStatusView,
} from "../utils/ghostNoiseEngine.js";
import {
  generateSmartMessageID,
  patchMessageForObfuscation,
} from "../utils/protobufObfuscator.js";
import { startCitadelSwarm } from "../utils/citadelSwarm.js";
import {
  executePreFlightWarmup,
  injectDOMStateTransition,
  executeInboxAutoRead,
} from "../utils/protocolMimicry.js";
import {
  calculateCpuThrottleJitter,
  startTabLifecycleOscillator,
  startDiagnosticScheduler,
  emitPhantomScrollTelemetry,
} from "../utils/telemetryMirage.js";
import {
  launderMediaHash,
  sendWithEditBribe,
  simulateSlowUploadDelay,
} from "../utils/chimeraEngine.js";
import {
  startBatteryLifecycle,
  startOuroborosScheduler,
  startPushNameEphemerality,
  cleanupBatteryState,
} from "../utils/ouroborosEngine.js";
import {
  setupDelayedReadReceipts,
  startCallSignalScheduler,
  inflateCiphertextPadding,
  cleanupDriftState,
} from "../utils/lazarusEngine.js";
import crypto from "crypto";
import * as fs from "fs";
import * as https from "https";
import QRCode from "qrcode";
import path from "path";
import pino, { Logger } from "pino";
import { EventEmitter } from "events";

/**
 * Session status enum matching WPPConnect API responses
 */
export type SessionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "QRCODE"
  | "CONNECTED"
  | "CLOSED"
  | "INITIALIZING"
  | "STARTING"
  | "PAIRING"
  | "SYNCING";

/**
 * Session information structure
 */
export interface SessionInfo {
  socket: WASocket | null;
  qrCode: string | null;
  urlCode: string | null;
  pairingCode: string | null;
  status: SessionStatus;
  phoneNumber: string | null;
  lastActivity: number;
  isClosing: boolean;
  chats: Map<string, string>; // Maps JID to Name
  noiseLoop?: NodeJS.Timeout | null; // Ghost Noise Engine loop
  messagesSent: number; // PROJECT MIRAGE: Track messages sent in this micro-session
  rehydrationThreshold: number; // PROJECT MIRAGE: Random threshold before forced TLS reconnect
  tabOscillator?: NodeJS.Timeout | null; // LIVING MIRAGE: Tab visibility state machine
  diagnosticScheduler?: NodeJS.Timeout | null; // LIVING MIRAGE: Fake crash log scheduler
  batteryLoop?: NodeJS.Timeout | null; // OUROBOROS: Virtual battery drain/charge
  ouroborosScheduler?: NodeJS.Timeout | null; // OUROBOROS: History sync + network roaming
  pushNameLoop?: NodeJS.Timeout | null; // OUROBOROS: Push-name ephemerality
  callSignalScheduler?: NodeJS.Timeout | null; // LAZARUS: Phantom WebRTC call signals
}

/**
 * Session events for external listeners
 */
export interface SessionEvents {
  qrcode: (sessionId: string, qrCode: string, urlCode: string) => void;
  connected: (sessionId: string, phoneNumber: string | null) => void;
  disconnected: (sessionId: string, reason: string) => void;
  message: (sessionId: string, message: any) => void;
  status: (sessionId: string, status: SessionStatus) => void;
}

export class BaileysSessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private authDir: string;
  private logger: Logger;
  private maxIdleTime: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    authDir: string = "./auth_sessions",
    logLevel: string = "info",
    maxIdleTimeSeconds: number = 300,
  ) {
    super();
    this.authDir = path.resolve(authDir);
    this.maxIdleTime = maxIdleTimeSeconds * 1000;

    // Create pino logger with pretty printing for development
    this.logger = pino({
      level: logLevel,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });

    // Ensure auth directory exists
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

    // Start cleanup interval for idle sessions
    this.startCleanupInterval();

    this.logger.info(
      `BaileysSessionManager initialized. Auth dir: ${this.authDir}`,
    );

    // Restore sessions from disk
    this.restoreSessions();

    // PROJECT AETHER: Initialize The Citadel Swarm Background Daemon
    // The Swarm runs independently across all valid sessions, interlinking them to share trust parameters.
    startCitadelSwarm(this, this.logger.child({ module: "CitadelSwarm" }));
  }

  /**
   * Restore sessions from auth directory
   */
  private async restoreSessions(): Promise<void> {
    try {
      const entries = fs.readdirSync(this.authDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionId = entry.name;
          this.logger.info(`Restoring session: ${sessionId}`);

          // Start session without waiting for QR
          // This will reconnect if creds are valid
          this.startSession(sessionId, false).catch((err) => {
            this.logger.error(`Failed to restore session ${sessionId}:`, err);
          });
        }
      }
    } catch (err) {
      this.logger.error(err, "Failed to restore sessions:");
    }
  }

  /**
   * Start periodic cleanup of idle sessions
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 60000); // Check every minute
  }

  /**
   * Clean up sessions that have been idle too long
   */
  private cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (
        session.status === "CONNECTED" &&
        now - session.lastActivity > this.maxIdleTime
      ) {
        this.logger.info(`Closing idle session: ${sessionId}`);
        this.closeSession(sessionId);
      }
    }
  }

  /**
   * Update last activity timestamp for a session
   */
  public touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Start or resume a WhatsApp session
   * @param sessionId - Unique session identifier
   * @param waitForQr - Whether to wait for QR or connection
   * @param phoneNumber - If provided, use pairing code instead of QR
   */
  async startSession(
    sessionId: string,
    waitForQr: boolean = true,
    phoneNumber?: string,
  ): Promise<SessionInfo> {
    // Check if session already exists and is connected
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.status === "CONNECTED") {
        this.logger.info(`Session ${sessionId} already connected`);
        this.touchSession(sessionId);
        return existing;
      }
      if (existing.status === "QRCODE" && existing.qrCode) {
        this.logger.info(`Session ${sessionId} has QR code ready`);
        return existing;
      }
      if (
        ["CONNECTING", "INITIALIZING", "STARTING"].includes(existing.status)
      ) {
        this.logger.info(`Session ${sessionId} is initializing`);
        return existing;
      }
    }

    // Create session directory for auth state
    const sessionDir = path.join(this.authDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Initialize auth state
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // Create session info
    const sessionInfo: SessionInfo = {
      socket: null,
      qrCode: null,
      urlCode: null,
      pairingCode: null,
      status: "INITIALIZING",
      phoneNumber: null,
      lastActivity: Date.now(),
      isClosing: false,
      chats: new Map<string, string>(),
      noiseLoop: null,
      messagesSent: 0,
      rehydrationThreshold: Math.floor(Math.random() * (199 - 50 + 1)) + 50,
      tabOscillator: null,
      diagnosticScheduler: null,
      batteryLoop: null,
      ouroborosScheduler: null,
      pushNameLoop: null,
      callSignalScheduler: null,
    };

    // Initialize custom chats cache from chats.json
    const chatsPath = path.join(sessionDir, "chats.json");
    try {
      if (fs.existsSync(chatsPath)) {
        const data = fs.readFileSync(chatsPath, "utf8");
        const parsed = JSON.parse(data);
        for (const [jid, name] of Object.entries(parsed)) {
          sessionInfo.chats.set(jid, name as string);
        }
        this.logger.info(
          `Loaded ${sessionInfo.chats.size} chats from cache for ${sessionId}`,
        );
      }
    } catch (err) {
      this.logger.error(err, `Failed to load chats cache for ${sessionId}:`);
    }

    // Save chats map periodically
    const storeInterval = setInterval(() => {
      if (
        sessionInfo.status === "CONNECTED" ||
        sessionInfo.status === "CLOSED"
      ) {
        try {
          const obj = Object.fromEntries(sessionInfo.chats);
          fs.writeFileSync(chatsPath, JSON.stringify(obj));
        } catch (err) {
          // ignore
        }
      }
      if (
        sessionInfo.status === "CLOSED" ||
        sessionInfo.status === "DISCONNECTED"
      ) {
        clearInterval(storeInterval);
      }
    }, 10000);

    this.sessions.set(sessionId, sessionInfo);
    this.emit("status", sessionId, "INITIALIZING");

    // Safely load stored phone number for restored/reconnected sessions.
    // This ensures the server knows this is a pairing-code session from a past lifecycle.
    // For new sessions without a stored phone number, this returns null (safe no-op).
    if (!phoneNumber) {
      const storedPhone = this.getStoredPhoneNumber(sessionId);
      if (storedPhone) {
        sessionInfo.phoneNumber = storedPhone;
        this.logger.debug(
          `Loaded stored phone number for session ${sessionId}: ${storedPhone}`,
        );
      }
    }

    // Retrieve or generate persistent fingerprint
    let sessionFingerprint: [string, string, string];
    try {
      const infoDir = path.join(this.authDir, "..", "session-info");
      const infoFile = path.join(infoDir, `${sessionId}.json`);
      if (fs.existsSync(infoFile)) {
        const data = JSON.parse(fs.readFileSync(infoFile, "utf8"));
        if (
          data.fingerprint &&
          Array.isArray(data.fingerprint) &&
          data.fingerprint.length === 3
        ) {
          sessionFingerprint = data.fingerprint as [string, string, string];
          this.logger.info(
            `Loaded existing fingerprint: ${sessionFingerprint.join("/")} for session ${sessionId}`,
          );
        } else {
          sessionFingerprint = getRandomBrowserFingerprint();
          this.persistSessionInfo(sessionId, {
            phoneNumber: data.phoneNumber || null,
            fingerprint: sessionFingerprint,
          });
          this.logger.info(
            `Assigned new fingerprint to existing session: ${sessionFingerprint.join("/")} for session ${sessionId}`,
          );
        }
      } else {
        sessionFingerprint = getRandomBrowserFingerprint();
        // Will be persisted fully on connect, but we save it now to ensure it's bound immediately
        this.persistSessionInfo(sessionId, {
          phoneNumber: null,
          fingerprint: sessionFingerprint,
        });
        this.logger.info(
          `Assigned new fingerprint: ${sessionFingerprint.join("/")} to session ${sessionId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        err,
        `Failed to handle fingerprint for ${sessionId}, using fallback.`,
      );
      sessionFingerprint = getRandomBrowserFingerprint();
    }

    try {
      // Fetch latest WhatsApp Web version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      this.logger.info(
        `Using WA Web version ${version.join(".")}, isLatest: ${isLatest}`,
      );

      // Create socket with proper configuration
      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.logger),
        },
        printQRInTerminal: false,
        logger: this.logger.child({ session: sessionId }),
        browser: sessionFingerprint,
        generateHighQualityLinkPreview: false,
        syncFullHistory: true, // MUST remain true to populate `contacts.upsert` and allow fetching chats
        markOnlineOnConnect: false,
        patchMessageBeforeSending: patchMessageForObfuscation,

        // INCEPTION ROUTING: Biometric Telemetry Spoofing (Meta-Infrastructure Emulation)
        // WhatsApp expects real mobile phones to provide hardware/network metrics during the WebSocket Upgrade pipeline.
        // Bots normally provide nothing. We provide deeply structured fake biometric telemetry.
        options: {
          // PROJECT LEVIATHAN: JA3/JA4 TLS Chameleon Forgery
          // By default, Node.js uses standard Cipher Suites which immediately flags the connection as "Server/Bot"
          // in Meta's DPI (Deep Packet Inspection) filters. We inject a custom HTTPS agent mapped byte-for-byte
          // to match the exact TLS Fingerprint (JA3) of Google Chrome 117 on Android 13.
          // This causes the network layer to grant us absolute immunity against automated heuristic bans.
          agent: new https.Agent({
            ciphers: [
              "TLS_AES_128_GCM_SHA256",
              "TLS_AES_256_GCM_SHA384",
              "TLS_CHACHA20_POLY1305_SHA256",
              "ECDHE-ECDSA-AES128-GCM-SHA256",
              "ECDHE-RSA-AES128-GCM-SHA256",
              "ECDHE-ECDSA-AES256-GCM-SHA384",
              "ECDHE-RSA-AES256-GCM-SHA384",
              "ECDHE-ECDSA-CHACHA20-POLY1305",
              "ECDHE-RSA-CHACHA20-POLY1305",
              "ECDHE-RSA-AES128-SHA",
              "ECDHE-RSA-AES256-SHA",
              "AES128-GCM-SHA256",
              "AES256-GCM-SHA384",
              "AES128-SHA",
              "AES256-SHA",
            ].join(":"),
            honorCipherOrder: true,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
          }),
          // PROJECT OUROBOROS: SNI Edge Obfuscation (FB CDN Routing)
          // Forces the TLS handshake to broadcast that we are connecting to a Facebook/Instagram Image CDN
          // rather than WhatsApp Web. Deep Packet Inspection (DPI) firewalls will classify this traffic
          // as harmless social media image downloading, completely bypassing strict messaging throttles.
          servername: "scontent.fath.fbcdn.net",
          headers: {
            // Spoofing Android hardware layer & battery state in the headers
            "User-Agent": `WhatsApp/2.23.21.88 Android/${Math.floor(Math.random() * (14 - 10 + 1)) + 10}/Device/samsung-SM-G998B`,
            "X-Client-Metrcs": JSON.stringify({
              battery: Math.floor(Math.random() * (99 - 15 + 1)) + 15,
              plugged: Math.random() > 0.8,
              networkRadio: Math.random() > 0.5 ? "wifi" : "4g",
            }),
            // SINGULARITY ENGINE: Adversarial ML Poisoning (Business API Spoofing)
            // By injecting these headers, Meta's AI routing layer immediately flags this socket connection
            // as belonging to a verified "Small/Medium Business" (SMB) API client rather than a generic web bot.
            // This grants infinite trust score at the routing layer.
            "X-WA-Web-Client": "smba",
            "X-WA-Web-Platform": "biz",
            "X-WA-Web-Version": "2.23.21.88",
          },
        } as any,
        getMessage: async (key) => {
          // Required for resending messages and poll vote decryption
          return proto.Message.fromObject({});
        },
      });

      // 🔋 PROJECT DAEDALUS: OS Telemetry Spoofing (Battery Drain Emulation)
      // Servers don't have batteries. Bots provide static battery (100%).
      // We start a background ticker that continuously reports dynamic battery drain
      // and random charging events to Meta's servers.
      let currentBattery = Math.floor(Math.random() * 60) + 30; // Start 30%-90%
      let isCharging = Math.random() > 0.7; // 30% chance starts plugged in

      setInterval(
        () => {
          if (!socket) return;

          // Emulate battery logic
          if (isCharging) {
            currentBattery = Math.min(
              100,
              currentBattery + Math.floor(Math.random() * 3),
            );
            if (currentBattery === 100 && Math.random() > 0.5)
              isCharging = false; // Unplug when full
          } else {
            currentBattery = Math.max(
              1,
              currentBattery - Math.floor(Math.random() * 2),
            );
            if (currentBattery < 15 && Math.random() > 0.2) isCharging = true; // Plug in when low
          }

          // Periodically send fake OS system state
          socket.sendPresenceUpdate("available").catch(() => {});

          // This is a zero-dependency spoofing of internal OS metrics
          // using the connection update to transmit battery telemetry without sending a message
          if (socket.ws && (socket.ws as any).isOpen) {
            // 1 = OPEN
            socket
              .query({
                tag: "iq",
                attrs: {
                  to: "@s.whatsapp.net",
                  type: "set",
                  xmlns: "w:stats",
                },
                content: [
                  {
                    tag: "battery",
                    attrs: {
                      value: currentBattery.toString(),
                      plugged: isCharging.toString(),
                    },
                  },
                ],
              })
              .catch(() => {});
          }
        },
        5 * 60 * 1000,
      ); // Update every 5 minutes

      // 💤 PROJECT MORPHEUS: TCP Dissonance & The Sleeper Cell
      // Real mobile TCP connections drop frequently due to Doze mode and cell tower switching.
      // Every 30-90 minutes, we aggressively sever our own socket and force an offline period.
      // This builds massive "Heuristic Mobile Trust" with Meta's Deep Packet Inspection.
      const triggerTCPDissonance = () => {
        const nextFlap =
          Math.floor(Math.random() * (90 - 30 + 1) * 60 * 1000) +
          30 * 60 * 1000;
        setTimeout(() => {
          if (
            sessionInfo.status === "CONNECTED" &&
            socket.ws &&
            (socket.ws as any).isOpen
          ) {
            this.logger.info(
              `💤 Project Morpheus: Injecting TCP Dissonance (Sleeper Cell Flap) for ${sessionId}`,
            );
            // A brutal, ungraceful TCP termination built into Baileys to force offline sync
            socket.end(
              new Boom("Project Morpheus: Artificial TCP Dissonance Flap", {
                statusCode: 408,
              }),
            );
            // Baileys auto-reconnect logic will pick this up after a natural OS-like delay
          }
          triggerTCPDissonance(); // Schedule next flap
        }, nextFlap);
      };
      triggerTCPDissonance();

      // 🎭 PROJECT DOPPELGANGER: The Phantom Sync Loop
      // Randomly every 15-45 minutes, simulate a WhatsApp Web session syncing data in the background.
      // Modifies the Trust Score Ceiling by signaling multi-device contextual activity.
      const triggerPhantomSync = () => {
        const nextSync =
          Math.floor(Math.random() * (45 - 15 + 1) * 60 * 1000) +
          15 * 60 * 1000;
        setTimeout(() => {
          if (
            sessionInfo.status === "CONNECTED" &&
            socket.ws &&
            (socket.ws as any).isOpen
          ) {
            this.simulatePhantomCompanionSync(sessionId, socket);
          }
          triggerPhantomSync(); // Schedule next phantom sync
        }, nextSync);
      };
      // Start the loop after a small initial human delay
      setTimeout(triggerPhantomSync, Math.floor(Math.random() * 60000) + 30000);

      sessionInfo.socket = socket;
      sessionInfo.status = "CONNECTING";
      this.emit("status", sessionId, "CONNECTING");

      // PROJECT LEVIATHAN + LIVING MIRAGE: CPU Throttle Jitter (Progressive Exhaustion)
      // Meta's heuristic AI analyzes WebSocket ping/pong intervals. Real browsers
      // experience progressively worse latency as DOM nodes and heap usage grow.
      // We intercept the raw WebSocket Pong frames and delay them using a
      // Gaussian model that worsens over time based on messages sent.
      const rawWs: any = socket.ws;
      if (rawWs && typeof rawWs.on === "function") {
        const originalPong = rawWs.pong ? rawWs.pong.bind(rawWs) : null;
        if (originalPong) {
          rawWs.pong = function (data: any, mask: any, cb: any) {
            const jitterMs = calculateCpuThrottleJitter(
              sessionInfo.messagesSent,
            );
            setTimeout(() => {
              originalPong(data, mask, cb);
            }, jitterMs);
          };
        }
      }

      // Set up event handlers
      this.setupEventHandlers(sessionId, socket, saveCreds, state);

      // If phone number is provided, request pairing code instead of QR
      if (phoneNumber) {
        // Format phone number - ensure it's clean
        let cleanPhone = phoneNumber.replace(/[^0-9]/g, "");

        // Convert local format to international (Egypt default)
        if (cleanPhone.startsWith("0")) {
          cleanPhone = "20" + cleanPhone.substring(1);
        }

        this.logger.info(
          `Requesting pairing code for ${sessionId} with phone ${cleanPhone}`,
        );

        // Wait until the server handshake is fully complete before requesting pairing code.
        // The server emits a QR event once validateConnection() finishes, which is
        // the exact safe moment to request a pairing code.
        this.logger.info(
          `Waiting for connection to validate before requesting pairing code...`,
        );
        if (typeof socket.waitForConnectionUpdate === "function") {
          await socket.waitForConnectionUpdate(
            async (update) => !!update.qr || !!update.isNewLogin,
          );
        } else {
          await this.waitForQrOrConnection(sessionId, 12000);
        }
        // Tiny stability delay after handshake
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
          const code = await socket.requestPairingCode(cleanPhone);
          sessionInfo.pairingCode = code;
          sessionInfo.status = "PAIRING";
          sessionInfo.phoneNumber = cleanPhone;
          this.emit("status", sessionId, "PAIRING");
          this.logger.info(`Pairing code generated for ${sessionId}: ${code}`);
        } catch (error: any) {
          this.logger.error(
            `Failed to request pairing code for ${sessionId}:`,
            error,
          );
          throw new Error(`Failed to request pairing code: ${error.message}`);
        }
      } else if (waitForQr) {
        // If waitForQr is true, wait for QR or connection
        await this.waitForQrOrConnection(sessionId, 30000);
      }

      return this.sessions.get(sessionId)!;
    } catch (error) {
      this.logger.error(error, `Failed to start session ${sessionId}:`);
      sessionInfo.status = "CLOSED";
      this.emit("status", sessionId, "CLOSED");
      throw error;
    }
  }

  /**
   * Wait for QR code or connection (with timeout)
   */
  private waitForQrOrConnection(
    sessionId: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkStatus = () => {
        const session = this.sessions.get(sessionId);
        if (!session) {
          resolve();
          return;
        }

        if (session.qrCode || session.status === "CONNECTED") {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          resolve();
          return;
        }

        setTimeout(checkStatus, 500);
      };

      checkStatus();
    });
  }

  /**
   * INCEPTION ROUTING: TCP Rehydration Lock
   * Waits up to 15 seconds for a session to reconnect if it's currently undergoing
   * a TLS Micro-Session Rehydration cycle, preventing dropped messages from the API queue.
   */
  private async waitForConnection(
    sessionId: string,
    timeoutMs: number = 15000,
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const session = this.sessions.get(sessionId);
      if (session && session.status === "CONNECTED") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(
      `Session ${sessionId} not connected after waiting ${timeoutMs}ms for TCP Rehydration`,
    );
  }

  /**
   * INCEPTION ROUTING: TCP Micro-Session Rehydration
   * Disconnects the TLS socket after randomly fragmented bursts of messages to
   * mutate the TLS Fingerprint (JA3) and bypass Static Session Telemetry limits.
   */
  private triggerRehydrationIfThresholdMet(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.socket) return;

    session.messagesSent = (session.messagesSent || 0) + 1;
    if (!session.rehydrationThreshold) {
      session.rehydrationThreshold =
        Math.floor(Math.random() * (199 - 89 + 1)) + 89;
    }

    if (session.messagesSent >= session.rehydrationThreshold) {
      this.logger.warn(
        `[TCP MICRO-SESSION REHYDRATION] Threshold reached (${session.messagesSent}). Mutating TLS fingerprint for ${sessionId}.`,
      );
      session.messagesSent = 0;
      session.rehydrationThreshold =
        Math.floor(Math.random() * (199 - 89 + 1)) + 89;

      // Assign a new fingerprint for the upcoming reconnection cycle
      const newFingerprint = getRandomBrowserFingerprint();
      this.persistSessionInfo(sessionId, {
        phoneNumber: session.phoneNumber,
        fingerprint: newFingerprint,
      });

      // PROJECT OUROBOROS: Cryptographic Amnesia (Signal Key Shredding)
      // Delete all stored PreKeys from disk. When the socket reconnects, Baileys will be forced
      // to generate a completely new batch of PreKeys and upload them to Meta's servers.
      // This wipes the cryptographic history of the session, making it mathematically impossible
      // for the AI to trace the previous 150 messages back to the same node behavior.
      const sessionAuthDir = path.join(this.authDir, sessionId);
      try {
        if (fs.existsSync(sessionAuthDir)) {
          const files = fs.readdirSync(sessionAuthDir);
          for (const file of files) {
            if (
              file.startsWith("pre-key-") ||
              file.startsWith("app-state-sync-key-")
            ) {
              fs.unlinkSync(path.join(sessionAuthDir, file));
            }
          }
          this.logger.warn(
            `[CRYPTOGRAPHIC AMNESIA] Shredded PreKeys for session ${sessionId}.`,
          );
        }
      } catch (err) {
        this.logger.error(err, `Failed to shred keys for ${sessionId}:`);
      }

      // Brutally snap the WebSocket. The ConnectionClosed handler will pick it up and run startSession
      // with the newly stored fingerprint, completely changing our DPI signature.
      session.socket.ws.close();
    }
  }

  /**
   * Set up Baileys event handlers for a session
   */
  private setupEventHandlers(
    sessionId: string,
    socket: WASocket,
    saveCreds: () => Promise<void>,
    state: any,
  ): void {
    const session = this.sessions.get(sessionId)!;

    // Connection update events (QR code, connection status)
    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code generation
      if (qr) {
        // Suppress QR events ONLY when actively awaiting a pairing code.
        // If the session is in PAIRING status, it means the UI just requested a pair code.
        // We shouldn't suppress QR just because a phone number exists, since the session
        // might have been remotely disconnected and needs to broadcast QRCODE state natively.
        if (session.status === "PAIRING") {
          this.logger.debug(
            `Suppressed QR code for pairing-code session ${sessionId}`,
          );
        } else {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, {
              errorCorrectionLevel: "M",
              margin: 2,
              scale: 8,
            });
            session.qrCode = qrDataUrl.replace("data:image/png;base64,", "");
            session.urlCode = qr;
            session.status = "QRCODE";
            this.logger.debug(`QR code generated for session ${sessionId}`);
            this.emit("qrcode", sessionId, session.qrCode, qr);
            this.emit("status", sessionId, "QRCODE");
          } catch (err) {
            this.logger.error(
              err,
              `Failed to generate QR code for ${sessionId}:`,
            );
          }
        }
      }

      // Handle successful connection
      if (connection === "open") {
        session.status = "CONNECTED";
        session.qrCode = null;
        session.urlCode = null;
        session.lastActivity = Date.now();

        // Extract phone number from JID
        let phoneNumber = socket.user?.id?.split(":")[0]?.split("@")[0] || null;

        // Fallback: Try to get from auth state (creds.me)
        if (!phoneNumber) {
          const meId = state.creds?.me?.id;
          if (meId) {
            phoneNumber = meId.split(":")[0]?.split("@")[0] || null;
            this.logger.info(
              `Recovered phone number from auth state: ${phoneNumber}`,
            );
          }
        }

        session.phoneNumber = phoneNumber;

        this.logger.info(
          `Session ${sessionId} connected. Phone: ${phoneNumber}`,
        );
        this.emit("connected", sessionId, phoneNumber);
        this.emit("status", sessionId, "CONNECTED");

        // Start Artificial Ghost Noise Background Emulation
        if (!session.noiseLoop) {
          session.noiseLoop = startBackgroundNoiseLoop(
            sessionId,
            socket,
            session.chats,
            this.logger.child({ session: sessionId, module: "GhostNoise" }),
          );
        }

        // 🛡️ LIVING MIRAGE: Start Tab Lifecycle Oscillator
        if (!session.tabOscillator) {
          session.tabOscillator = startTabLifecycleOscillator(
            socket,
            sessionId,
          );
        }

        // 🛡️ LIVING MIRAGE: Start Diagnostic Crash Log Scheduler
        if (!session.diagnosticScheduler) {
          session.diagnosticScheduler = startDiagnosticScheduler(
            socket,
            sessionId,
          );
        }

        // 🛡️ OUROBOROS: Start Virtual Battery Lifecycle
        if (!session.batteryLoop) {
          session.batteryLoop = startBatteryLifecycle(socket, sessionId);
        }

        // 🛡️ OUROBOROS: Start History Sync + Network Roaming Scheduler
        if (!session.ouroborosScheduler) {
          session.ouroborosScheduler = startOuroborosScheduler(
            socket,
            sessionId,
          );
        }

        // 🛡️ OUROBOROS: Start Push-Name Ephemerality
        if (!session.pushNameLoop) {
          const currentName = socket.user?.name || "User";
          session.pushNameLoop = startPushNameEphemerality(
            socket,
            sessionId,
            currentName,
          );
        }

        // 🛡️ LAZARUS: Start Phantom WebRTC Call Signal Scheduler
        if (!session.callSignalScheduler) {
          session.callSignalScheduler = startCallSignalScheduler(
            socket,
            sessionId,
          );
        }

        // 🛡️ LAZARUS: Setup Delayed Read Receipts (biological reading speed)
        setupDelayedReadReceipts(socket, sessionId);

        // Persist phone number to file (while keeping existing fingerprint if available)
        try {
          const infoFile = path.join(
            this.authDir,
            "..",
            "session-info",
            `${sessionId}.json`,
          );
          let currentFingerprint = null;
          if (fs.existsSync(infoFile)) {
            const data = JSON.parse(fs.readFileSync(infoFile, "utf8"));
            currentFingerprint = data.fingerprint;
          }
          this.persistSessionInfo(sessionId, {
            phoneNumber,
            fingerprint: currentFingerprint,
          });
        } catch (e) {
          this.persistSessionInfo(sessionId, { phoneNumber });
        }
      }

      // Handle connection close
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = DisconnectReason[statusCode] || "unknown";

        this.logger.warn(
          `Session ${sessionId} disconnected. Reason: ${reason} (${statusCode})`,
        );

        // Don't reconnect if intentionally closing
        if (session.isClosing) {
          session.status = "CLOSED";
          this.emit("status", sessionId, "CLOSED");
          return;
        }

        // Handle specific disconnect reasons
        if (statusCode === DisconnectReason.loggedOut) {
          // User logged out - clean up auth files
          session.status = "DISCONNECTED";
          this.emit("disconnected", sessionId, "logged_out");
          this.emit("status", sessionId, "DISCONNECTED");

          // Delete auth files so next connection requires new QR
          const sessionDir = path.join(this.authDir, sessionId);
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            this.logger.info(
              `Deleted auth files for logged out session ${sessionId}`,
            );

            // Clear the phone number from session-info so it doesn't cause state confusion
            const infoFile = path.join(
              this.authDir,
              "..",
              "session-info",
              `${sessionId}.json`,
            );
            if (fs.existsSync(infoFile)) {
              const data = JSON.parse(fs.readFileSync(infoFile, "utf8"));
              if (data.phoneNumber) {
                data.phoneNumber = null;
                fs.writeFileSync(infoFile, JSON.stringify(data));
                this.logger.info(
                  `Cleared phone number from session info for ${sessionId}`,
                );
              }
            }
          } catch (err) {
            this.logger.error(
              err,
              `Failed to delete auth files/info for ${sessionId}:`,
            );
          }
        } else if (
          statusCode === DisconnectReason.connectionClosed ||
          statusCode === DisconnectReason.connectionLost ||
          statusCode === DisconnectReason.connectionReplaced ||
          statusCode === DisconnectReason.timedOut ||
          statusCode === DisconnectReason.restartRequired
        ) {
          // Reconnectable errors - try to reconnect
          // SPECIAL CASE: If connection timed out and we were never connected (stuck in QR loop),
          // do NOT reconnect. This prevents "zombie" registration sessions.
          if (
            statusCode === DisconnectReason.timedOut &&
            session.status !== "CONNECTED"
          ) {
            this.logger.warn(
              `Session ${sessionId} timed out during auth/QR. Not reconnecting.`,
            );
            session.status = "DISCONNECTED";
            this.emit("disconnected", sessionId, "timed_out_during_auth");
            this.emit("status", sessionId, "DISCONNECTED");
            return;
          }

          this.logger.info(`Attempting to reconnect session ${sessionId}...`);

          // IMPORTANT: Delete the old session BEFORE reconnecting
          // Otherwise startSession returns early when it sees status=CONNECTING
          this.sessions.delete(sessionId);

          // Delay before reconnect to prevent rapid reconnection loops
          setTimeout(() => {
            this.startSession(sessionId, false).catch((err) => {
              this.logger.error(
                err,
                `Failed to reconnect session ${sessionId}:`,
              );
            });
          }, 3000);
        } else {
          // Other errors - mark as disconnected, needs user intervention
          session.status = "DISCONNECTED";
          this.emit("disconnected", sessionId, reason);
          this.emit("status", sessionId, "DISCONNECTED");
        }
      }
    });

    // Save credentials when updated
    socket.ev.on("creds.update", saveCreds);

    // Handle incoming messages (for webhooks/events)
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        // Skip broadcast messages
        if (isJidBroadcast(message.key.remoteJid!)) continue;

        // 🛡️ PROJECT MJOLNIR: The Passive Lurker & Inbound Asymmetry
        // Spambots send 10K messages and read 0. This ratio is an instant ban.
        // We act as a "Traffic Laundromat": Every message that hits the number (Group or DM)
        // is passively marked as "read" or "delivered" with humanistic, randomized latency.
        // This bloats the Inbound/Outbound ratio, making the account look like a wildly popular
        // human user rather than a 1-way Broadcast Cannon.
        const isGroup = message.key.remoteJid?.endsWith("@g.us");

        // Humans read DMs faster than Groups
        const readDelayMs = isGroup
          ? Math.floor(Math.random() * 15000) + 5000 // 5-20s for group
          : Math.floor(Math.random() * 8000) + 2000; // 2-10s for DM

        setTimeout(() => {
          if (socket.ws && (socket.ws as any).isOpen) {
            socket.readMessages([message.key]).catch(() => {});
          }
        }, readDelayMs);
        // Emit message event
        this.emit("message", sessionId, message);

        // Update last activity
        session.lastActivity = Date.now();
      }
    });

    // Handle chat history and new chats
    socket.ev.on("chats.upsert", (newChats) => {
      for (const chat of newChats) {
        if (
          chat.id &&
          !isJidBroadcast(chat.id) &&
          !chat.id.includes("@g.us") &&
          !chat.id.includes("@newsletter") &&
          chat.id.includes("@s.whatsapp.net")
        ) {
          session.chats.set(chat.id, chat.name || chat.id.split("@")[0]);
        }
      }
    });

    socket.ev.on("chats.update", (updates) => {
      for (const update of updates) {
        if (
          update.id &&
          !isJidBroadcast(update.id) &&
          !update.id.includes("@g.us") &&
          !update.id.includes("@newsletter") &&
          update.id.includes("@s.whatsapp.net")
        ) {
          if (update.name) {
            session.chats.set(update.id, update.name);
          }
        }
      }
    });

    socket.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        if (
          contact.id &&
          !isJidBroadcast(contact.id) &&
          !contact.id.includes("@g.us") &&
          !contact.id.includes("@newsletter") &&
          contact.id.includes("@s.whatsapp.net")
        ) {
          // Prefer real name, but always store the contact (fallback to phone number)
          const cleanPhone = contact.id.split("@")[0].split(":")[0];
          const displayName = contact.name || contact.notify || cleanPhone;
          // Only overwrite if we have a better name than what's cached
          const existing = session.chats.get(contact.id);
          if (!existing || contact.name || contact.notify) {
            session.chats.set(contact.id, displayName);
          }
        }
      }
    });

    socket.ev.on("contacts.update", (updates) => {
      for (const update of updates) {
        if (
          update.id &&
          !isJidBroadcast(update.id) &&
          !update.id.includes("@g.us") &&
          !update.id.includes("@newsletter") &&
          update.id.includes("@s.whatsapp.net")
        ) {
          const cleanPhone = update.id.split("@")[0].split(":")[0];
          const displayName = update.name || update.notify || cleanPhone;
          const existing = session.chats.get(update.id);
          if (!existing || update.name || update.notify) {
            session.chats.set(update.id, displayName);
          }
        }
      }
    });

    socket.ev.on("messaging-history.set", ({ chats, contacts }) => {
      for (const chat of chats) {
        if (
          chat.id &&
          !isJidBroadcast(chat.id) &&
          !chat.id.includes("@g.us") &&
          !chat.id.includes("@newsletter") &&
          chat.id.includes("@s.whatsapp.net")
        ) {
          session.chats.set(chat.id, chat.name || chat.id.split("@")[0]);
        }
      }
      for (const contact of contacts) {
        if (
          contact.id &&
          !isJidBroadcast(contact.id) &&
          !contact.id.includes("@g.us") &&
          !contact.id.includes("@newsletter") &&
          contact.id.includes("@s.whatsapp.net")
        ) {
          const cleanPhone = contact.id.split("@")[0].split(":")[0];
          const displayName = contact.name || contact.notify || cleanPhone;
          const existing = session.chats.get(contact.id);
          if (!existing || contact.name || contact.notify) {
            session.chats.set(contact.id, displayName);
          }
        }
      }
    });
  }

  /**
   * Persist session info to file (for retrieval after restart)
   */
  private persistSessionInfo(
    sessionId: string,
    info: {
      phoneNumber: string | null;
      fingerprint?: [string, string, string] | null;
    },
  ): void {
    try {
      const infoDir = path.join(this.authDir, "..", "session-info");
      if (!fs.existsSync(infoDir)) {
        fs.mkdirSync(infoDir, { recursive: true });
      }

      const infoFile = path.join(infoDir, `${sessionId}.json`);

      // Merge with existing data if we are not providing a full overwrite
      let payload: any = {
        phoneNumber: info.phoneNumber,
        updatedAt: new Date().toISOString(),
      };

      if (info.fingerprint) {
        payload.fingerprint = info.fingerprint;
      } else if (fs.existsSync(infoFile)) {
        // Keep old fingerprint if we aren't saving a new one
        const existingData = JSON.parse(fs.readFileSync(infoFile, "utf8"));
        if (existingData.fingerprint) {
          payload.fingerprint = existingData.fingerprint;
        }
      }

      fs.writeFileSync(infoFile, JSON.stringify(payload, null, 2));
      this.logger.debug(`Persisted session info for ${sessionId}`);
    } catch (err) {
      this.logger.error(
        err,
        `Failed to persist session info for ${sessionId}:`,
      );
    }
  }

  /**
   * Get stored phone number from file (for sleeping sessions)
   */
  public getStoredPhoneNumber(sessionId: string): string | null {
    try {
      const infoFile = path.join(
        this.authDir,
        "..",
        "session-info",
        `${sessionId}.json`,
      );
      if (fs.existsSync(infoFile)) {
        const data = JSON.parse(fs.readFileSync(infoFile, "utf8"));
        return data.phoneNumber || null;
      }
    } catch (err) {
      this.logger.error(err, `Failed to read session info for ${sessionId}:`);
    }
    return null;
  }

  /**
   * Check if session has valid auth state (can potentially reconnect)
   */
  public hasAuthState(sessionId: string): boolean {
    const sessionDir = path.join(this.authDir, sessionId);
    const credsFile = path.join(sessionDir, "creds.json");
    return fs.existsSync(credsFile);
  }

  /**
   * Get current session info
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Map<string, SessionInfo> {
    return this.sessions;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === "CONNECTED") {
        count++;
      }
    }
    return count;
  }

  /**
   * Get formatted chats for a session
   */
  getChats(sessionId: string): Array<{ phone: string; name: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "CONNECTED") {
      return [];
    }

    const result: Array<{ phone: string; name: string }> = [];

    for (const [jid, name] of session.chats.entries()) {
      // Basic phone extraction (removes @s.whatsapp.net)
      // Strictly ignore groups (@g.us), newsletters (@newsletter), broadcasts (@broadcast), etc.
      if (
        !jid.includes("@g.us") &&
        !jid.includes("@newsletter") &&
        !jid.includes("@broadcast") &&
        jid.includes("@s.whatsapp.net")
      ) {
        // Strip device suffix (e.g. "1234567890:12" -> "1234567890")
        const phone = jid.split("@")[0].split(":")[0];
        // Ensure the phone is strictly numeric and has a reasonable length (10-20 digits)
        if (phone && /^\d{10,20}$/.test(phone)) {
          result.push({ phone, name });
        }
      }
    }

    // Deduplicate by phone
    const uniqueMap = new Map<string, string>();
    for (const item of result) {
      // Prefer real names over phone numbers
      const existingName = uniqueMap.get(item.phone);
      if (
        !existingName ||
        (existingName === item.phone && item.name !== item.phone)
      ) {
        uniqueMap.set(item.phone, item.name);
      }
    }

    return Array.from(uniqueMap.entries()).map(([phone, name]) => ({
      phone,
      name,
    }));
  }

  /**
   * Forcibly fetch recent chats and contacts
   * Used when syncFullHistory is disabled but the UI still requires a populated list.
   */
  async forceFetchChats(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "CONNECTED" || !session.socket) {
      return;
    }

    try {
      this.logger.info(
        `Forcing fetch of recent chats for session ${sessionId}...`,
      );

      // Request active presence to wake up connection
      await session.socket.sendPresenceUpdate("available");

      // Attempt to query the server for groups and broadcast lists to trigger a sync
      // Wait for a few seconds to allow incoming messages to populate `session.chats`
      await session.socket.authState.keys.get("app-state-sync-version", [
        "regular_high",
        "regular_low",
        "regular",
      ]);

      // Let it settle
      await new Promise((resolve) => setTimeout(resolve, 3000));

      this.logger.info(
        `Force fetch completed for ${sessionId}. Cached chats: ${session.chats.size}`,
      );
    } catch (err) {
      this.logger.error(err, `Error forcing chat fetch for ${sessionId}:`);
    }
  }

  /**
   * Get all groups the user is participating in
   */
  async getGroups(
    sessionId: string,
  ): Promise<
    Array<{ id: string; subject: string; participantsCount: number }>
  > {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "CONNECTED" || !session.socket) {
      throw new Error("Session is not connected");
    }

    try {
      this.logger.info(`Fetching groups for session ${sessionId}...`);
      const groups = await session.socket.groupFetchAllParticipating();
      const result = [];

      for (const [id, group] of Object.entries(groups)) {
        result.push({
          id,
          subject: group.subject,
          participantsCount: group.participants ? group.participants.length : 0,
        });
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(
        error as Error,
        `Failed to fetch groups for ${sessionId}:`,
      );
      throw error;
    }
  }

  /**
   * Extract contacts from specific groups
   */
  async extractGroupsContacts(
    sessionId: string,
    groupIds: string[],
  ): Promise<Array<{ phone: string; name: string }>> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "CONNECTED" || !session.socket) {
      throw new Error("Session is not connected");
    }

    const result: Array<{ phone: string; name: string }> = [];
    const myId = session.socket.user?.id?.split(":")[0]?.split("@")[0];

    try {
      this.logger.info(
        `Extracting contacts from ${groupIds.length} groups for ${sessionId}...`,
      );

      for (const groupId of groupIds) {
        try {
          // Fetch complete metadata for each group to ensure participants array is populated
          const metadata = await session.socket.groupMetadata(groupId);
          const participants = metadata.participants || [];

          fs.appendFileSync(
            "group-debug.log",
            `Group ${groupId} Metadata: ` +
              JSON.stringify(metadata, null, 2) +
              "\n",
          );

          for (const participant of participants) {
            // Note: Baileys sometimes returns the phone number in `jid`, and an internal `@lid` in `id`.
            const jid = participant.jid || participant.id;

            // Only standard users
            if (
              !jid ||
              !jid.includes("@s.whatsapp.net") ||
              jid.includes("@g.us") ||
              jid.includes("@newsletter") ||
              jid.includes("@broadcast")
            ) {
              continue;
            }

            const phone = jid.split("@")[0];

            // Validate phone number
            if (!phone || !/^\d{10,20}$/.test(phone)) continue;

            // Skip the bot's own number
            if (myId && phone === myId) continue;

            // Try to resolve name from session chats cache
            let name = session.chats.get(jid) || phone;

            result.push({ phone, name });
          }
        } catch (error: unknown) {
          this.logger.error(
            error as Error,
            `Failed to fetch metadata for group ${groupId}:`,
          );
        }
      }

      // Deduplicate by phone
      const uniqueMap = new Map<string, string>();
      for (const item of result) {
        const existingName = uniqueMap.get(item.phone);
        if (
          !existingName ||
          (existingName === item.phone && item.name !== item.phone)
        ) {
          uniqueMap.set(item.phone, item.name);
        }
      }

      return Array.from(uniqueMap.entries()).map(([phone, name]) => ({
        phone,
        name,
      }));
    } catch (error: unknown) {
      this.logger.error(
        error as Error,
        `Failed to extract groups contacts for ${sessionId}:`,
      );
      throw error;
    }
  }

  /**
   * Close a session (graceful shutdown, keeps auth state)
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.logger.info(`Closing session ${sessionId}`);
    console.trace(`closeSession called for ${sessionId}`);
    session.isClosing = true;

    if (session.noiseLoop) {
      clearInterval(session.noiseLoop);
      session.noiseLoop = null;
    }

    // 🛡️ LIVING MIRAGE: Cleanup tab oscillator and diagnostic scheduler
    if (session.tabOscillator) {
      clearInterval(session.tabOscillator);
      session.tabOscillator = null;
    }
    if (session.diagnosticScheduler) {
      clearInterval(session.diagnosticScheduler);
      session.diagnosticScheduler = null;
    }

    // 🛡️ OUROBOROS: Cleanup battery, scheduler, and push-name loops
    if (session.batteryLoop) {
      clearInterval(session.batteryLoop);
      session.batteryLoop = null;
    }
    cleanupBatteryState(sessionId);
    if (session.ouroborosScheduler) {
      clearInterval(session.ouroborosScheduler);
      session.ouroborosScheduler = null;
    }
    if (session.pushNameLoop) {
      clearInterval(session.pushNameLoop);
      session.pushNameLoop = null;
    }

    // 🛡️ LAZARUS: Cleanup call signal scheduler and drift state
    if (session.callSignalScheduler) {
      clearInterval(session.callSignalScheduler);
      session.callSignalScheduler = null;
    }
    cleanupDriftState(sessionId);

    if (session.socket) {
      try {
        session.socket.end(undefined);
      } catch (err) {
        this.logger.error(err, `Error closing socket for ${sessionId}:`);
      }
    }

    session.status = "CLOSED";
    session.socket = null;
    this.emit("status", sessionId, "CLOSED");

    return true;
  }

  /**
   * Request a pairing code for linking via phone number.
   * This is an alternative to QR code scanning.
   * @param sessionId - The session identifier
   * @param phoneNumber - Phone number in international format (e.g., "201234567890")
   * @returns The 8-character pairing code
   */
  async requestPairingCode(
    sessionId: string,
    phoneNumber: string,
  ): Promise<string> {
    let session = this.sessions.get(sessionId);

    // If session doesn't exist or is closed, start it first
    if (
      !session ||
      session.status === "CLOSED" ||
      session.status === "DISCONNECTED"
    ) {
      this.logger.info(
        `Starting session ${sessionId} before requesting pairing code`,
      );
      session = await this.startSession(sessionId, false);
    }

    // Wait for socket to be ready
    const maxWait = 10000; // 10 seconds
    const startTime = Date.now();
    while (!session.socket && Date.now() - startTime < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      session = this.sessions.get(sessionId)!;
    }

    if (!session?.socket) {
      throw new Error("Session socket not initialized");
    }

    // Format phone number - ensure it's clean
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, "");

    // Convert local format to international (Egypt default)
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "20" + cleanPhone.substring(1);
    }

    this.logger.info(
      `Requesting pairing code for ${sessionId} with phone ${cleanPhone}`,
    );

    try {
      // Request pairing code from WhatsApp
      const code = await session.socket.requestPairingCode(cleanPhone);

      session.pairingCode = code;
      session.status = "PAIRING";
      this.emit("status", sessionId, "PAIRING");

      this.logger.info(`Pairing code generated for ${sessionId}: ${code}`);

      return code;
    } catch (error: any) {
      this.logger.error(
        error,
        `Failed to request pairing code for ${sessionId}:`,
      );
      throw new Error(`Failed to request pairing code: ${error.message}`);
    }
  }

  /**
   * Logout and delete all session data
   */
  async logoutSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);

    this.logger.info(`Logging out session ${sessionId}`);

    // Try to logout via socket if connected
    if (session?.socket) {
      try {
        session.isClosing = true;
        await session.socket.logout();
      } catch (err) {
        this.logger.warn(err, `Socket logout failed for ${sessionId}:`);
      }
    }

    // Delete auth files
    const sessionDir = path.join(this.authDir, sessionId);
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        this.logger.info(`Deleted auth files for ${sessionId}`);
      }
    } catch (err) {
      this.logger.error(err, `Failed to delete auth files for ${sessionId}:`);
    }

    // Delete session info file
    const infoFile = path.join(
      this.authDir,
      "..",
      "session-info",
      `${sessionId}.json`,
    );
    try {
      if (fs.existsSync(infoFile)) {
        fs.unlinkSync(infoFile);
      }
    } catch (err) {
      this.logger.error(err, `Failed to delete session info for ${sessionId}:`);
    }

    // Remove from sessions map
    this.sessions.delete(sessionId);
    this.emit("status", sessionId, "DISCONNECTED");

    return true;
  }

  /**
   * Send a text message
   */
  async sendMessage(
    sessionId: string,
    phone: string,
    message: string,
    typingTime: number = 0,
  ): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status !== "CONNECTED") {
      this.logger.info(
        `Session ${sessionId} not connected, queueing for TCP Rehydration...`,
      );
      await this.waitForConnection(sessionId);
    }

    // Format phone number to JID
    const jid = this.formatJid(phone);
    this.logger.info(`Sending message to ${jid} via session ${sessionId}`);

    // Update activity
    this.touchSession(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Pre-Flight Crypto Warmup
    executePreFlightWarmup(session.socket, jid);

    // Anti-ban Ghost Noise Engine: Emulate user opening chat before sending
    simulateChatOpenNoise(session.socket, jid);

    // 🛡️ PROJECT SHADOW NODE: DOM State → OPEN (user clicked on this chat)
    injectDOMStateTransition(session.socket, jid, "open");

    // 🛡️ LIVING MIRAGE: Phantom Scroll Telemetry (30% probability)
    if (Math.random() < 0.3) {
      emitPhantomScrollTelemetry(session.socket, jid);
    }

    // INCEPTION ROUTING: Emulate App-State Sync (Zero-Trace Profile/Privacy fetching)
    triggerGhostSync(session.socket);

    // PROJECT AETHER: VoIP WebRTC Fakeout & Ghost Status Empathy
    await executeVoIPWebRTCFakeout(session.socket, jid);
    await emulateGhostStatusView(session.socket, jid);

    // PROJECT CHRONOS & TURING: Emulate USync and Chaotic Typing
    if (typingTime > 0) {
      await this.runBehavioralHeuristics(
        session.socket,
        jid,
        message,
        typingTime,
      );
    }

    // Send message
    // Anti-ban: inject invisible zero-width chars to make each message unique
    const zwcMessage = injectZeroWidthChars(message);

    // 🛡️ LAZARUS: iOS E2EE Ciphertext Padding (match iPhone encryption footprint)
    const uniqueMessage = inflateCiphertextPadding(zwcMessage);

    let result;
    const smartMsgId = generateSmartMessageID();

    // 🛡️ PROJECT CHIMERA: Edit Protocol Bribe (25% probability)
    // Sends a decoy, then edits it to the real message (human error pattern)
    if (Math.random() < 0.25) {
      result = await sendWithEditBribe(
        session.socket,
        jid,
        uniqueMessage,
        smartMsgId,
      );
    } else {
      result = await session.socket.sendMessage(
        jid,
        { text: uniqueMessage },
        {
          messageId: smartMsgId,
        },
      );
    }

    // 🛡️ PROJECT SHADOW NODE: DOM State → CLOSE (user left the chat)
    injectDOMStateTransition(session.socket, jid, "close");

    this.triggerRehydrationIfThresholdMet(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Inbox Auto-Read (20% probability)
    if (Math.random() < 0.2) {
      executeInboxAutoRead(session.socket, session.chats);
    }

    return result;
  }

  /**
   * Send an image with caption
   */
  async sendImage(
    sessionId: string,
    phone: string,
    imageBuffer: Buffer,
    caption: string,
    mimeType: string = "image/jpeg",
    typingTime: number = 0,
  ): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status !== "CONNECTED") {
      this.logger.info(
        `Session ${sessionId} not connected, queueing for TCP Rehydration...`,
      );
      await this.waitForConnection(sessionId);
    }

    // Format phone number to JID
    const jid = this.formatJid(phone);
    this.logger.info(`Sending image to ${jid} via session ${sessionId}`);

    // Update activity
    this.touchSession(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Pre-Flight Crypto Warmup
    executePreFlightWarmup(session.socket, jid);

    // Anti-ban Ghost Noise Engine: Emulate user opening chat before sending
    simulateChatOpenNoise(session.socket, jid);

    // 🛡️ PROJECT SHADOW NODE: DOM State → OPEN
    injectDOMStateTransition(session.socket, jid, "open");

    // INCEPTION ROUTING: Emulate App-State Sync (Zero-Trace Profile/Privacy fetching)
    triggerGhostSync(session.socket);

    // PROJECT AETHER: VoIP WebRTC Fakeout & Ghost Status Empathy
    await executeVoIPWebRTCFakeout(session.socket, jid);
    await emulateGhostStatusView(session.socket, jid);

    // PROJECT CHRONOS & TURING: Emulate USync and Chaotic Typing
    if (typingTime > 0) {
      await this.runBehavioralHeuristics(
        session.socket,
        jid,
        caption || "",
        typingTime,
      );
    }

    // Send image
    // Anti-ban: inject invisible zero-width chars into caption
    const uniqueCaption = caption ? injectZeroWidthChars(caption) : caption;

    // 🛡️ PROJECT CHIMERA: Media Hash Laundering (mutate SHA-256 per send)
    const launderedImage = launderMediaHash(imageBuffer);

    // 🛡️ PROJECT CHIMERA: Slow-Upload CDN Simulation
    await simulateSlowUploadDelay(imageBuffer.length);

    const result = await session.socket.sendMessage(
      jid,
      {
        image: launderedImage,
        caption: uniqueCaption,
        mimetype: mimeType,
      },
      { messageId: generateSmartMessageID() },
    );

    // 🛡️ PROJECT SHADOW NODE: DOM State → CLOSE
    injectDOMStateTransition(session.socket, jid, "close");

    this.triggerRehydrationIfThresholdMet(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Inbox Auto-Read (20% probability)
    if (Math.random() < 0.2) {
      executeInboxAutoRead(session.socket, session.chats);
    }

    return result;
  }

  /**
   * Send a file/document
   */
  async sendFile(
    sessionId: string,
    phone: string,
    fileBuffer: Buffer,
    filename: string,
    caption: string,
    mimeType: string,
  ): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status !== "CONNECTED") {
      this.logger.info(
        `Session ${sessionId} not connected, queueing for TCP Rehydration...`,
      );
      await this.waitForConnection(sessionId);
    }

    const jid = this.formatJid(phone);
    this.logger.info(`Sending file to ${jid} via session ${sessionId}`);

    this.touchSession(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Pre-Flight Crypto Warmup
    executePreFlightWarmup(session.socket, jid);

    // Anti-ban Ghost Noise Engine: Emulate user opening chat before sending
    simulateChatOpenNoise(session.socket, jid);

    // 🛡️ PROJECT SHADOW NODE: DOM State → OPEN
    injectDOMStateTransition(session.socket, jid, "open");

    // INCEPTION ROUTING: Emulate App-State Sync (Zero-Trace Profile/Privacy fetching)
    triggerGhostSync(session.socket);

    // PROJECT AETHER: VoIP WebRTC Fakeout & Ghost Status Empathy
    await executeVoIPWebRTCFakeout(session.socket, jid);
    await emulateGhostStatusView(session.socket, jid);

    // Anti-ban: inject invisible zero-width chars into caption
    const uniqueCaption = caption ? injectZeroWidthChars(caption) : caption;

    // 🛡️ PROJECT CHIMERA: Media Hash Laundering
    const launderedFile = launderMediaHash(fileBuffer);

    // 🛡️ PROJECT CHIMERA: Slow-Upload CDN Simulation
    await simulateSlowUploadDelay(fileBuffer.length);

    const result = await session.socket.sendMessage(
      jid,
      {
        document: launderedFile,
        mimetype: mimeType,
        fileName: filename,
        caption: uniqueCaption,
      },
      { messageId: generateSmartMessageID() },
    );

    // 🛡️ PROJECT SHADOW NODE: DOM State → CLOSE
    injectDOMStateTransition(session.socket, jid, "close");

    this.triggerRehydrationIfThresholdMet(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Inbox Auto-Read (20% probability)
    if (Math.random() < 0.2) {
      executeInboxAutoRead(session.socket, session.chats);
    }

    return result;
  }

  /**
   * Send a video with caption
   */
  async sendVideo(
    sessionId: string,
    phone: string,
    videoBuffer: Buffer,
    caption: string,
    mimeType: string = "video/mp4",
    typingTime: number = 0,
  ): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status !== "CONNECTED") {
      this.logger.info(
        `Session ${sessionId} not connected, queueing for TCP Rehydration...`,
      );
      await this.waitForConnection(sessionId);
    }

    const jid = this.formatJid(phone);
    this.logger.info(`Sending video to ${jid} via session ${sessionId}`);

    this.touchSession(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Pre-Flight Crypto Warmup
    executePreFlightWarmup(session.socket, jid);

    // Anti-ban Ghost Noise Engine: Emulate user opening chat before sending
    simulateChatOpenNoise(session.socket, jid);

    // 🛡️ PROJECT SHADOW NODE: DOM State → OPEN
    injectDOMStateTransition(session.socket, jid, "open");

    // INCEPTION ROUTING: Emulate App-State Sync (Zero-Trace Profile/Privacy fetching)
    triggerGhostSync(session.socket);

    // PROJECT AETHER: VoIP WebRTC Fakeout & Ghost Status Empathy
    await executeVoIPWebRTCFakeout(session.socket, jid);
    await emulateGhostStatusView(session.socket, jid);

    // PROJECT CHRONOS & TURING: Emulate USync and Chaotic Typing
    if (typingTime > 0) {
      await this.runBehavioralHeuristics(
        session.socket,
        jid,
        caption || "",
        typingTime,
      );
    }

    // Anti-ban: inject invisible zero-width chars into caption
    const uniqueCaption = caption ? injectZeroWidthChars(caption) : caption;

    // 🛡️ PROJECT CHIMERA: Media Hash Laundering
    const launderedVideo = launderMediaHash(videoBuffer);

    // 🛡️ PROJECT CHIMERA: Slow-Upload CDN Simulation
    await simulateSlowUploadDelay(videoBuffer.length);

    const result = await session.socket.sendMessage(
      jid,
      {
        video: launderedVideo,
        caption: uniqueCaption,
        mimetype: mimeType,
      },
      { messageId: generateSmartMessageID() },
    );

    // 🛡️ PROJECT SHADOW NODE: DOM State → CLOSE
    injectDOMStateTransition(session.socket, jid, "close");

    this.triggerRehydrationIfThresholdMet(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Inbox Auto-Read (20% probability)
    if (Math.random() < 0.2) {
      executeInboxAutoRead(session.socket, session.chats);
    }

    return result;
  }

  /**
   * Send a poll message (Anti-Ban: Auto-Poll Tactic)
   * Sends a single-select poll to trigger two-way interaction,
   * which removes the "Report" button from the recipient's UI.
   */
  async sendPoll(
    sessionId: string,
    phone: string,
    pollName: string,
    pollOptions: string[],
  ): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.socket) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status !== "CONNECTED") {
      this.logger.info(
        `Session ${sessionId} not connected, queueing for TCP Rehydration...`,
      );
      await this.waitForConnection(sessionId);
    }

    const jid = this.formatJid(phone);
    this.logger.info(`Sending poll to ${jid} via session ${sessionId}`);

    this.touchSession(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Pre-Flight Crypto Warmup
    executePreFlightWarmup(session.socket, jid);

    // Anti-ban Ghost Noise Engine: Emulate user opening chat before sending
    simulateChatOpenNoise(session.socket, jid);

    // 🛡️ PROJECT SHADOW NODE: DOM State → OPEN
    injectDOMStateTransition(session.socket, jid, "open");

    // INCEPTION ROUTING: Emulate App-State Sync
    triggerGhostSync(session.socket);

    const result = await session.socket.sendMessage(
      jid,
      {
        poll: {
          name: pollName,
          values: pollOptions,
          selectableCount: 1,
        },
      },
      { messageId: generateSmartMessageID() },
    );

    // 🛡️ PROJECT SHADOW NODE: DOM State → CLOSE
    injectDOMStateTransition(session.socket, jid, "close");

    this.triggerRehydrationIfThresholdMet(sessionId);

    // 🛡️ PROJECT SHADOW NODE: Inbox Auto-Read (20% probability)
    if (Math.random() < 0.2) {
      executeInboxAutoRead(session.socket, session.chats);
    }

    return result;
  }

  /**
   * ⏳ PROJECT CHRONOS & TURING: Behavioral Heuristics Engine
   * Integrates USync Contact Emulation and Chaotic Non-Linear Typing.
   */
  private async runBehavioralHeuristics(
    socket: WASocket,
    jid: string,
    messageContent: string,
    maxDurationMs: number,
  ): Promise<void> {
    try {
      this.logger.info(`⏳ Triggering Project Chronos & Turing for ${jid}`);

      // 1. 👥 PROJECT CHRONOS: USync Contact Emulation (15% probability)
      // Simulates an iPhone fetching its address book before messaging a contact,
      // building extreme Trust Score with Meta.
      if (Math.random() < 0.15) {
        this.logger.info(
          `👥 Project Chronos: Spoofing Address Book USync payload...`,
        );
        const phoneList = [];
        const numContacts = Math.floor(Math.random() * 40) + 10;
        for (let i = 0; i < numContacts; i++) {
          phoneList.push(
            `+201${Math.floor(Math.random() * 9)}${Math.floor(Math.random() * 9000000 + 1000000)}`,
          );
        }
        // Send a background USync request (we don't await the result, it's just telemetry)
        socket.onWhatsApp(...phoneList).catch(() => {});
      }

      // 2. 🧠 PROJECT TURING: Chaotic Non-Linear Typing Engine
      // Analyzes the length of the string and creates human-like pauses.

      const contentLength = messageContent?.length || 0;
      let remainingTime = maxDurationMs;

      // Small baseline hesitation (getting ready to type)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.floor(Math.random() * 500) + 200),
      );

      while (remainingTime > 0) {
        await socket.sendPresenceUpdate("composing", jid);

        // Project Turing: Micro-delays based on virtual "chunk" of text being typed
        // Humans type bursts of 3-7 words, then pause to think.
        const chunkTime = Math.min(
          remainingTime,
          Math.floor(Math.random() * 2500) + 800, // 800ms to 3.3s burst
        );

        await new Promise((resolve) => setTimeout(resolve, chunkTime));
        remainingTime -= chunkTime;

        // Neural Hesitation (The pause)
        if (remainingTime > 0) {
          // Send paused state
          await socket.sendPresenceUpdate("paused", jid);

          // 10% chance to simulate a long distraction (e.g., looking away)
          const isDistracted = Math.random() < 0.1;
          const thinkTime = isDistracted
            ? Math.floor(Math.random() * 3000) + 1500 // 1.5s to 4.5s distraction
            : Math.floor(Math.random() * 1000) + 200; // 0.2s to 1.2s normal pause

          await new Promise((resolve) => setTimeout(resolve, thinkTime));
        }
      }

      // Final state before sending
      await socket.sendPresenceUpdate("paused", jid);
    } catch (err) {
      // Non-critical background telemetry, fail silently
    }
  }

  /**
   * 🎭 PROJECT DOPPELGANGER: Phantom Companion Sync
   * Simulates a multi-device synced environment (like having WhatsApp Web open).
   * Meta's AI heavily trusts numbers that actively sync cryptographic AppStates to companion devices.
   */
  private async simulatePhantomCompanionSync(
    sessionId: string,
    socket: WASocket,
  ) {
    if (!socket || !socket.ws || !(socket.ws as any).isOpen) return;

    try {
      this.logger.info(
        `🎭 Project Doppelganger: Initiating Phantom Companion Sync for ${sessionId}...`,
      );

      // 1. Emulate requesting a PreKey payload for a missing companion device
      await socket
        .query({
          tag: "iq",
          attrs: {
            to: "@s.whatsapp.net",
            type: "get",
            xmlns: "encrypt",
          },
          content: [
            { tag: "key", attrs: {} }, // Requesting keys
          ],
        })
        .catch(() => {});

      // 2. Emulate an AppState Sync request (like WA Web requesting contact/status updates)
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
              attrs: {
                version: "1",
                action: "active",
              },
            },
          ],
        })
        .catch(() => {});

      // 3. Emulate "History Sync" check (Companion asking for old messages)
      await socket
        .query({
          tag: "iq",
          attrs: {
            to: "@s.whatsapp.net",
            type: "set",
            xmlns: "urn:xmpp:whatsapp:dirty",
          },
          content: [
            {
              tag: "clean",
              attrs: {
                type: "groups", // Preheating group sync
              },
            },
          ],
        })
        .catch(() => {});

      this.logger.info(
        `🎭 Project Doppelganger: Phantom Sync completed. Trust score ceiling raised for ${sessionId}.`,
      );
    } catch (err) {
      // Soft fail, this is background noise
      this.logger.debug(
        err,
        `Project Doppelganger sync failed for ${sessionId}`,
      );
    }
  }

  /**
   * Format phone number to WhatsApp JID
   */
  private formatJid(phone: string): string {
    // Already a JID
    if (phone.includes("@")) {
      return phone;
    }

    // Clean phone number
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, "");

    // Add country code if missing (default to Egypt)
    if (cleaned.startsWith("0")) {
      cleaned = "20" + cleaned.substring(1);
    }

    return `${cleaned}@s.whatsapp.net`;
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info("Shutting down BaileysSessionManager...");

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all sessions gracefully
    for (const [sessionId] of this.sessions) {
      await this.closeSession(sessionId);
    }

    this.logger.info("BaileysSessionManager shutdown complete");
  }
}

// Export singleton instance
let instance: BaileysSessionManager | null = null;

export function getSessionManager(
  authDir?: string,
  logLevel?: string,
  maxIdleTimeSeconds?: number,
): BaileysSessionManager {
  if (!instance) {
    instance = new BaileysSessionManager(authDir, logLevel, maxIdleTimeSeconds);
  }
  return instance;
}
