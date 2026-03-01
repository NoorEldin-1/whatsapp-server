/**
 * 🛡️ PROJECT CHIMERA: Deep Cryptographic & CDN Forgery Engine
 *
 * Reverse-engineers WhatsApp's cryptographic spam detection layers:
 * - Media Hash Clustering (SHA-256 fingerprinting)
 * - Broadcast Pattern Detection (one-sided messaging graphs)
 * - CDN Upload Speed Analysis (bot vs. human upload velocity)
 * - Edit Message Protocol (human error correction signals)
 *
 * Core Functions:
 * 1. launderMediaHash — Mutate media SHA-256 per recipient
 * 2. sendWithEditBribe — Send decoy → delay → Edit to real message
 * 3. buildPhantomContextInfo — Fake reply chains for trust
 * 4. simulateSlowUploadDelay — Throttle to mimic slow Wi-Fi
 */

import { WASocket, proto } from "@whiskeysockets/baileys";
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
 * Pool of short, innocent "decoy" messages for the Edit Bribe.
 * These are intentionally casual and human-sounding to pass
 * Meta's initial content filter before being edited.
 */
const DECOY_MESSAGES: string[] = [
  "مرحبا",
  "السلام عليكم",
  "اهلا",
  "هلا",
  "كيف الحال",
  "يا هلا",
  "تمام",
  "hi",
  "hello",
  "hey",
  "مساء الخير",
  "صباح الخير",
  "ازيك",
  "عامل ايه",
];

/**
 * 🧬 Dynamic Media Hash Laundering (SHA-256 Mutation)
 *
 * When Meta receives the same image 500 times, it computes
 * the SHA-256 hash and flags the sender for mass spamming.
 *
 * This function injects 4-16 random invisible bytes at the
 * end of the media Buffer. The result:
 * - Visually IDENTICAL image/video for the recipient
 * - Completely UNIQUE SHA-256 hash for Meta's clustering AI
 *
 * The appended bytes are placed AFTER the media's end-of-file
 * marker, so image/video decoders ignore them entirely.
 *
 * @param buffer The original image/video/document Buffer
 * @returns A new Buffer with mutated hash (visually identical)
 */
export const launderMediaHash = (buffer: Buffer): Buffer => {
  // Generate 4-16 random bytes (invisible noise)
  const noiseLength = Math.floor(Math.random() * 13) + 4;
  const noise = crypto.randomBytes(noiseLength);

  // Concatenate: original media + invisible random noise
  const launderedBuffer = Buffer.concat([buffer, noise]);

  logger.info(
    `[CHIMERA] Media Hash Laundered: +${noiseLength} bytes → new SHA256 fingerprint`,
  );

  return launderedBuffer;
};

/**
 * ✏️ The Edit Protocol Bribe (Decoy → Delay → Edit)
 *
 * No spam bot ever edits a message. Editing requires "human error":
 * someone typed the wrong thing and corrected it. Meta's AI gives
 * massive trust to connections that use the Edit protocol.
 *
 * Flow:
 * 1. Send a short, casual decoy message ("مرحبا", "hi", etc.)
 * 2. Wait 2-4 seconds (human "realization" time)
 * 3. Send an Edit packet replacing the decoy with the real campaign message
 *
 * The recipient sees the final, edited campaign message.
 * Meta's AI sees a human who typed casually, then corrected themselves.
 *
 * @param socket The active WASocket
 * @param jid Target JID
 * @param realMessage The actual campaign message to deliver
 * @param messageId The message ID to use (from generateSmartMessageID)
 * @returns The result of the edit operation
 */
export const sendWithEditBribe = async (
  socket: WASocket,
  jid: string,
  realMessage: string,
  messageId: string,
): Promise<any> => {
  // Step 1: Pick a random decoy message
  const decoy =
    DECOY_MESSAGES[Math.floor(Math.random() * DECOY_MESSAGES.length)];

  // Step 2: Send the decoy as a normal message
  const sentResult = await socket.sendMessage(
    jid,
    { text: decoy },
    { messageId },
  );

  // Guard: if decoy send failed, fall back to direct send
  if (!sentResult?.key) {
    return socket.sendMessage(jid, { text: realMessage }, { messageId });
  }

  logger.info(
    `[CHIMERA] Edit Bribe: Decoy "${decoy}" sent → waiting to edit...`,
  );

  // Step 3: Wait 2-4 seconds (human "oh wait, that's wrong" delay)
  const editDelay = Math.floor(Math.random() * 2000) + 2000;
  await new Promise((resolve) => setTimeout(resolve, editDelay));

  // Step 4: Send the Edit packet to overwrite decoy with real campaign message
  const editResult = await socket.sendMessage(jid, {
    text: realMessage,
    edit: sentResult.key,
  });

  logger.info(
    `[CHIMERA] Edit Bribe: Message edited after ${editDelay}ms → campaign delivered`,
  );

  return editResult;
};

/**
 * 👻 Phantom Reply Context Builder (Fake Quote Chains)
 *
 * Broadcast/campaign messages are "one-sided" (no conversation context).
 * Meta's Graph AI flags numbers that only send isolated messages.
 * Conversations with "replies" (quoted messages) are trusted.
 *
 * This function generates a fake ContextInfo that makes the message
 * appear as a "reply" to a previous (non-existent) message.
 * The quoted message ID is cryptographically random, so WhatsApp
 * won't find the original — but its Graph AI still registers
 * the pattern as "active two-way conversation".
 *
 * @param jid The chat JID (used as the "participant" who sent the quoted msg)
 * @returns A proto.IContextInfo object to inject into the message
 */
export const buildPhantomContextInfo = (jid: string): proto.IContextInfo => {
  // Generate a fake stanza ID matching WhatsApp's format (uppercase hex-like)
  const fakeStanzaId =
    "3EB0" + crypto.randomBytes(8).toString("hex").toUpperCase();

  // The "quoted message" that never existed
  // We use a simple, innocent text to look authentically conversational
  const phantomQuotes: string[] = [
    "تمام",
    "اوك",
    "حاضر",
    "ان شاء الله",
    "👍",
    "ماشي",
    "طيب",
    "ok",
  ];
  const phantomText =
    phantomQuotes[Math.floor(Math.random() * phantomQuotes.length)];

  const contextInfo: proto.IContextInfo = {
    stanzaId: fakeStanzaId,
    participant: jid, // The "author" of the phantom message
    quotedMessage: {
      conversation: phantomText,
    },
  };

  logger.info(
    `[CHIMERA] Phantom Context: Faked reply to "${phantomText}" (ID: ${fakeStanzaId.substring(0, 8)}...)`,
  );

  return contextInfo;
};

/**
 * 🐌 Slow-Upload CDN Simulation (Bandwidth Throttle)
 *
 * Server-hosted bots upload 5MB files to Meta's CDN in <0.05 seconds
 * (because they sit on 10Gbps datacenter connections).
 * A real user on home Wi-Fi uploads 5MB in ~2-4 seconds.
 *
 * This function adds a calibrated delay BEFORE sending media,
 * proportional to the file size, simulating a realistic upload
 * time for a mid-range home/mobile internet connection.
 *
 * Assumes ~2-5 Mbps effective upload speed (typical 4G/Wi-Fi).
 *
 * @param bufferSizeBytes The size of the media being "uploaded"
 */
export const simulateSlowUploadDelay = async (
  bufferSizeBytes: number,
): Promise<void> => {
  // Simulate 2-5 Mbps upload speed (250KB/s to 625KB/s)
  const simulatedSpeedBytesPerSec =
    Math.floor(Math.random() * (625_000 - 250_000)) + 250_000;

  // Calculate how long this "upload" would take on real Wi-Fi
  let uploadTimeMs = (bufferSizeBytes / simulatedSpeedBytesPerSec) * 1000;

  // Add random jitter (±20%) to simulate network instability
  const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  uploadTimeMs *= jitterFactor;

  // Clamp: minimum 500ms, maximum 8 seconds
  uploadTimeMs = Math.max(500, Math.min(8000, Math.round(uploadTimeMs)));

  logger.info(
    `[CHIMERA] Slow-Upload: Simulating ${(bufferSizeBytes / 1024).toFixed(0)}KB upload → ${uploadTimeMs}ms delay`,
  );

  await new Promise((resolve) => setTimeout(resolve, uploadTimeMs));
};
