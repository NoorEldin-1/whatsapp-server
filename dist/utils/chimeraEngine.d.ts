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
export declare const launderMediaHash: (buffer: Buffer) => Buffer;
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
export declare const sendWithEditBribe: (socket: WASocket, jid: string, realMessage: string, messageId: string) => Promise<any>;
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
export declare const buildPhantomContextInfo: (jid: string) => proto.IContextInfo;
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
export declare const simulateSlowUploadDelay: (bufferSizeBytes: number) => Promise<void>;
//# sourceMappingURL=chimeraEngine.d.ts.map