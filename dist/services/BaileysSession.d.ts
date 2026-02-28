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
import { WASocket } from "@whiskeysockets/baileys";
import { EventEmitter } from "events";
/**
 * Session status enum matching WPPConnect API responses
 */
export type SessionStatus = "DISCONNECTED" | "CONNECTING" | "QRCODE" | "CONNECTED" | "CLOSED" | "INITIALIZING" | "STARTING" | "PAIRING" | "SYNCING";
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
    chats: Map<string, string>;
    noiseLoop?: NodeJS.Timeout | null;
    messagesSent: number;
    rehydrationThreshold: number;
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
export declare class BaileysSessionManager extends EventEmitter {
    private sessions;
    private authDir;
    private logger;
    private maxIdleTime;
    private cleanupInterval;
    constructor(authDir?: string, logLevel?: string, maxIdleTimeSeconds?: number);
    /**
     * Restore sessions from auth directory
     */
    private restoreSessions;
    /**
     * Start periodic cleanup of idle sessions
     */
    private startCleanupInterval;
    /**
     * Clean up sessions that have been idle too long
     */
    private cleanupIdleSessions;
    /**
     * Update last activity timestamp for a session
     */
    touchSession(sessionId: string): void;
    /**
     * Start or resume a WhatsApp session
     * @param sessionId - Unique session identifier
     * @param waitForQr - Whether to wait for QR or connection
     * @param phoneNumber - If provided, use pairing code instead of QR
     */
    startSession(sessionId: string, waitForQr?: boolean, phoneNumber?: string): Promise<SessionInfo>;
    /**
     * Wait for QR code or connection (with timeout)
     */
    private waitForQrOrConnection;
    /**
     * INCEPTION ROUTING: TCP Rehydration Lock
     * Waits up to 15 seconds for a session to reconnect if it's currently undergoing
     * a TLS Micro-Session Rehydration cycle, preventing dropped messages from the API queue.
     */
    private waitForConnection;
    /**
     * INCEPTION ROUTING: TCP Micro-Session Rehydration
     * Disconnects the TLS socket after randomly fragmented bursts of messages to
     * mutate the TLS Fingerprint (JA3) and bypass Static Session Telemetry limits.
     */
    private triggerRehydrationIfThresholdMet;
    /**
     * Set up Baileys event handlers for a session
     */
    private setupEventHandlers;
    /**
     * Persist session info to file (for retrieval after restart)
     */
    private persistSessionInfo;
    /**
     * Get stored phone number from file (for sleeping sessions)
     */
    getStoredPhoneNumber(sessionId: string): string | null;
    /**
     * Check if session has valid auth state (can potentially reconnect)
     */
    hasAuthState(sessionId: string): boolean;
    /**
     * Get current session info
     */
    getSession(sessionId: string): SessionInfo | undefined;
    /**
     * Get all active sessions
     */
    getAllSessions(): Map<string, SessionInfo>;
    /**
     * Get active session count
     */
    getActiveSessionCount(): number;
    /**
     * Get formatted chats for a session
     */
    getChats(sessionId: string): Array<{
        phone: string;
        name: string;
    }>;
    /**
     * Forcibly fetch recent chats and contacts
     * Used when syncFullHistory is disabled but the UI still requires a populated list.
     */
    forceFetchChats(sessionId: string): Promise<void>;
    /**
     * Get all groups the user is participating in
     */
    getGroups(sessionId: string): Promise<Array<{
        id: string;
        subject: string;
        participantsCount: number;
    }>>;
    /**
     * Extract contacts from specific groups
     */
    extractGroupsContacts(sessionId: string, groupIds: string[]): Promise<Array<{
        phone: string;
        name: string;
    }>>;
    /**
     * Close a session (graceful shutdown, keeps auth state)
     */
    closeSession(sessionId: string): Promise<boolean>;
    /**
     * Request a pairing code for linking via phone number.
     * This is an alternative to QR code scanning.
     * @param sessionId - The session identifier
     * @param phoneNumber - Phone number in international format (e.g., "201234567890")
     * @returns The 8-character pairing code
     */
    requestPairingCode(sessionId: string, phoneNumber: string): Promise<string>;
    /**
     * Logout and delete all session data
     */
    logoutSession(sessionId: string): Promise<boolean>;
    /**
     * Send a text message
     */
    sendMessage(sessionId: string, phone: string, message: string, typingTime?: number): Promise<any>;
    /**
     * Send an image with caption
     */
    sendImage(sessionId: string, phone: string, imageBuffer: Buffer, caption: string, mimeType?: string, typingTime?: number): Promise<any>;
    /**
     * Send a file/document
     */
    sendFile(sessionId: string, phone: string, fileBuffer: Buffer, filename: string, caption: string, mimeType: string): Promise<any>;
    /**
     * Send a video with caption
     */
    sendVideo(sessionId: string, phone: string, videoBuffer: Buffer, caption: string, mimeType?: string, typingTime?: number): Promise<any>;
    /**
     * ⏳ PROJECT CHRONOS & TURING: Behavioral Heuristics Engine
     * Integrates USync Contact Emulation and Chaotic Non-Linear Typing.
     */
    private runBehavioralHeuristics;
    /**
     * 🎭 PROJECT DOPPELGANGER: Phantom Companion Sync
     * Simulates a multi-device synced environment (like having WhatsApp Web open).
     * Meta's AI heavily trusts numbers that actively sync cryptographic AppStates to companion devices.
     */
    private simulatePhantomCompanionSync;
    /**
     * Format phone number to WhatsApp JID
     */
    private formatJid;
    /**
     * Cleanup on shutdown
     */
    shutdown(): Promise<void>;
}
export declare function getSessionManager(authDir?: string, logLevel?: string, maxIdleTimeSeconds?: number): BaileysSessionManager;
//# sourceMappingURL=BaileysSession.d.ts.map