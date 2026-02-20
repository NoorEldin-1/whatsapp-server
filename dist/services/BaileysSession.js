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
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, isJidBroadcast, proto, Browsers, } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import pino from "pino";
import { EventEmitter } from "events";
export class BaileysSessionManager extends EventEmitter {
    sessions = new Map();
    authDir;
    logger;
    maxIdleTime;
    cleanupInterval = null;
    constructor(authDir = "./auth_sessions", logLevel = "info", maxIdleTimeSeconds = 300) {
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
        this.logger.info(`BaileysSessionManager initialized. Auth dir: ${this.authDir}`);
        // Restore sessions from disk
        this.restoreSessions();
    }
    /**
     * Restore sessions from auth directory
     */
    async restoreSessions() {
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
        }
        catch (err) {
            this.logger.error(err, "Failed to restore sessions:");
        }
    }
    /**
     * Start periodic cleanup of idle sessions
     */
    startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleSessions();
        }, 60000); // Check every minute
    }
    /**
     * Clean up sessions that have been idle too long
     */
    cleanupIdleSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions) {
            if (session.status === "CONNECTED" &&
                now - session.lastActivity > this.maxIdleTime) {
                this.logger.info(`Closing idle session: ${sessionId}`);
                this.closeSession(sessionId);
            }
        }
    }
    /**
     * Update last activity timestamp for a session
     */
    touchSession(sessionId) {
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
    async startSession(sessionId, waitForQr = true, phoneNumber) {
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
            if (["CONNECTING", "INITIALIZING", "STARTING"].includes(existing.status)) {
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
        const sessionInfo = {
            socket: null,
            qrCode: null,
            urlCode: null,
            pairingCode: null,
            status: "INITIALIZING",
            phoneNumber: null,
            lastActivity: Date.now(),
            isClosing: false,
        };
        this.sessions.set(sessionId, sessionInfo);
        this.emit("status", sessionId, "INITIALIZING");
        try {
            // Fetch latest WhatsApp Web version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            this.logger.info(`Using WA Web version ${version.join(".")}, isLatest: ${isLatest}`);
            // Create socket with proper configuration
            const socket = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, this.logger),
                },
                printQRInTerminal: false,
                logger: this.logger.child({ session: sessionId }),
                browser: Browsers.ubuntu("Chrome"),
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                getMessage: async (key) => {
                    // Required for resending messages and poll vote decryption
                    return proto.Message.fromObject({});
                },
            });
            sessionInfo.socket = socket;
            sessionInfo.status = "CONNECTING";
            this.emit("status", sessionId, "CONNECTING");
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
                this.logger.info(`Requesting pairing code for ${sessionId} with phone ${cleanPhone}`);
                // Wait a moment for socket to be ready before requesting pairing code
                await new Promise((resolve) => setTimeout(resolve, 1500));
                try {
                    const code = await socket.requestPairingCode(cleanPhone);
                    sessionInfo.pairingCode = code;
                    sessionInfo.status = "PAIRING";
                    sessionInfo.phoneNumber = cleanPhone;
                    this.emit("status", sessionId, "PAIRING");
                    this.logger.info(`Pairing code generated for ${sessionId}: ${code}`);
                }
                catch (error) {
                    this.logger.error(`Failed to request pairing code for ${sessionId}:`, error);
                    throw new Error(`Failed to request pairing code: ${error.message}`);
                }
            }
            else if (waitForQr) {
                // If waitForQr is true, wait for QR or connection
                await this.waitForQrOrConnection(sessionId, 30000);
            }
            return this.sessions.get(sessionId);
        }
        catch (error) {
            this.logger.error(error, `Failed to start session ${sessionId}:`);
            sessionInfo.status = "CLOSED";
            this.emit("status", sessionId, "CLOSED");
            throw error;
        }
    }
    /**
     * Wait for QR code or connection (with timeout)
     */
    waitForQrOrConnection(sessionId, timeoutMs) {
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
     * Set up Baileys event handlers for a session
     */
    setupEventHandlers(sessionId, socket, saveCreds, state) {
        const session = this.sessions.get(sessionId);
        // Connection update events (QR code, connection status)
        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            // Handle QR code generation
            if (qr) {
                try {
                    const qrDataUrl = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: "M",
                        margin: 2,
                        scale: 8,
                    });
                    session.qrCode = qrDataUrl.replace("data:image/png;base64,", "");
                    session.urlCode = qr;
                    session.status = "QRCODE";
                    this.logger.info(`QR code generated for session ${sessionId}`);
                    this.emit("qrcode", sessionId, session.qrCode, qr);
                    this.emit("status", sessionId, "QRCODE");
                }
                catch (err) {
                    this.logger.error(err, `Failed to generate QR code for ${sessionId}:`);
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
                        this.logger.info(`Recovered phone number from auth state: ${phoneNumber}`);
                    }
                }
                session.phoneNumber = phoneNumber;
                this.logger.info(`Session ${sessionId} connected. Phone: ${phoneNumber}`);
                this.emit("connected", sessionId, phoneNumber);
                this.emit("status", sessionId, "CONNECTED");
                // Persist phone number to file
                this.persistSessionInfo(sessionId, { phoneNumber });
            }
            // Handle connection close
            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason[statusCode] || "unknown";
                this.logger.warn(`Session ${sessionId} disconnected. Reason: ${reason} (${statusCode})`);
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
                        this.logger.info(`Deleted auth files for logged out session ${sessionId}`);
                    }
                    catch (err) {
                        this.logger.error(err, `Failed to delete auth files for ${sessionId}:`);
                    }
                }
                else if (statusCode === DisconnectReason.connectionClosed ||
                    statusCode === DisconnectReason.connectionLost ||
                    statusCode === DisconnectReason.connectionReplaced ||
                    statusCode === DisconnectReason.timedOut ||
                    statusCode === DisconnectReason.restartRequired) {
                    // Reconnectable errors - try to reconnect
                    // SPECIAL CASE: If connection timed out and we were never connected (stuck in QR loop),
                    // do NOT reconnect. This prevents "zombie" registration sessions.
                    if (statusCode === DisconnectReason.timedOut &&
                        session.status !== "CONNECTED") {
                        this.logger.warn(`Session ${sessionId} timed out during auth/QR. Not reconnecting.`);
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
                            this.logger.error(err, `Failed to reconnect session ${sessionId}:`);
                        });
                    }, 3000);
                }
                else {
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
            if (type !== "notify")
                return;
            for (const message of messages) {
                // Skip broadcast messages
                if (isJidBroadcast(message.key.remoteJid))
                    continue;
                // Emit message event
                this.emit("message", sessionId, message);
                // Update last activity
                session.lastActivity = Date.now();
            }
        });
    }
    /**
     * Persist session info to file (for retrieval after restart)
     */
    persistSessionInfo(sessionId, info) {
        try {
            const infoDir = path.join(this.authDir, "..", "session-info");
            if (!fs.existsSync(infoDir)) {
                fs.mkdirSync(infoDir, { recursive: true });
            }
            const infoFile = path.join(infoDir, `${sessionId}.json`);
            fs.writeFileSync(infoFile, JSON.stringify({
                phoneNumber: info.phoneNumber,
                updatedAt: new Date().toISOString(),
            }, null, 2));
            this.logger.debug(`Persisted session info for ${sessionId}`);
        }
        catch (err) {
            this.logger.error(err, `Failed to persist session info for ${sessionId}:`);
        }
    }
    /**
     * Get stored phone number from file (for sleeping sessions)
     */
    getStoredPhoneNumber(sessionId) {
        try {
            const infoFile = path.join(this.authDir, "..", "session-info", `${sessionId}.json`);
            if (fs.existsSync(infoFile)) {
                const data = JSON.parse(fs.readFileSync(infoFile, "utf8"));
                return data.phoneNumber || null;
            }
        }
        catch (err) {
            this.logger.error(err, `Failed to read session info for ${sessionId}:`);
        }
        return null;
    }
    /**
     * Check if session has valid auth state (can potentially reconnect)
     */
    hasAuthState(sessionId) {
        const sessionDir = path.join(this.authDir, sessionId);
        const credsFile = path.join(sessionDir, "creds.json");
        return fs.existsSync(credsFile);
    }
    /**
     * Get current session info
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Get all active sessions
     */
    getAllSessions() {
        return this.sessions;
    }
    /**
     * Get count of active sessions
     */
    getActiveSessionCount() {
        let count = 0;
        for (const session of this.sessions.values()) {
            if (session.status === "CONNECTED") {
                count++;
            }
        }
        return count;
    }
    /**
     * Close a session (graceful shutdown, keeps auth state)
     */
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return false;
        }
        this.logger.info(`Closing session ${sessionId}`);
        session.isClosing = true;
        if (session.socket) {
            try {
                session.socket.end(undefined);
            }
            catch (err) {
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
    async requestPairingCode(sessionId, phoneNumber) {
        let session = this.sessions.get(sessionId);
        // If session doesn't exist or is closed, start it first
        if (!session ||
            session.status === "CLOSED" ||
            session.status === "DISCONNECTED") {
            this.logger.info(`Starting session ${sessionId} before requesting pairing code`);
            session = await this.startSession(sessionId, false);
        }
        // Wait for socket to be ready
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();
        while (!session.socket && Date.now() - startTime < maxWait) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            session = this.sessions.get(sessionId);
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
        this.logger.info(`Requesting pairing code for ${sessionId} with phone ${cleanPhone}`);
        try {
            // Request pairing code from WhatsApp
            const code = await session.socket.requestPairingCode(cleanPhone);
            session.pairingCode = code;
            session.status = "PAIRING";
            this.emit("status", sessionId, "PAIRING");
            this.logger.info(`Pairing code generated for ${sessionId}: ${code}`);
            return code;
        }
        catch (error) {
            this.logger.error(error, `Failed to request pairing code for ${sessionId}:`);
            throw new Error(`Failed to request pairing code: ${error.message}`);
        }
    }
    /**
     * Logout and delete all session data
     */
    async logoutSession(sessionId) {
        const session = this.sessions.get(sessionId);
        this.logger.info(`Logging out session ${sessionId}`);
        // Try to logout via socket if connected
        if (session?.socket) {
            try {
                session.isClosing = true;
                await session.socket.logout();
            }
            catch (err) {
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
        }
        catch (err) {
            this.logger.error(err, `Failed to delete auth files for ${sessionId}:`);
        }
        // Delete session info file
        const infoFile = path.join(this.authDir, "..", "session-info", `${sessionId}.json`);
        try {
            if (fs.existsSync(infoFile)) {
                fs.unlinkSync(infoFile);
            }
        }
        catch (err) {
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
    async sendMessage(sessionId, phone, message, typingTime = 0) {
        const session = this.sessions.get(sessionId);
        if (!session?.socket) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (session.status !== "CONNECTED") {
            throw new Error(`Session ${sessionId} not connected (status: ${session.status})`);
        }
        // Format phone number to JID
        const jid = this.formatJid(phone);
        this.logger.info(`Sending message to ${jid} via session ${sessionId}`);
        // Update activity
        this.touchSession(sessionId);
        // Simulate typing before sending (anti-ban measure)
        if (typingTime > 0) {
            await this.simulateTyping(session.socket, jid, typingTime);
        }
        // Send message
        const result = await session.socket.sendMessage(jid, { text: message });
        return result;
    }
    /**
     * Send an image with caption
     */
    async sendImage(sessionId, phone, imageBuffer, caption, mimeType = "image/jpeg", typingTime = 0) {
        const session = this.sessions.get(sessionId);
        if (!session?.socket) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (session.status !== "CONNECTED") {
            throw new Error(`Session ${sessionId} not connected (status: ${session.status})`);
        }
        // Format phone number to JID
        const jid = this.formatJid(phone);
        this.logger.info(`Sending image to ${jid} via session ${sessionId}`);
        // Update activity
        this.touchSession(sessionId);
        // Simulate typing before sending (anti-ban measure)
        if (typingTime > 0) {
            await this.simulateTyping(session.socket, jid, typingTime);
        }
        // Send image
        const result = await session.socket.sendMessage(jid, {
            image: imageBuffer,
            caption: caption,
            mimetype: mimeType,
        });
        return result;
    }
    /**
     * Send a file/document
     */
    async sendFile(sessionId, phone, fileBuffer, filename, caption, mimeType) {
        const session = this.sessions.get(sessionId);
        if (!session?.socket) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (session.status !== "CONNECTED") {
            throw new Error(`Session ${sessionId} not connected (status: ${session.status})`);
        }
        const jid = this.formatJid(phone);
        this.logger.info(`Sending file to ${jid} via session ${sessionId}`);
        this.touchSession(sessionId);
        const result = await session.socket.sendMessage(jid, {
            document: fileBuffer,
            mimetype: mimeType,
            fileName: filename,
            caption: caption,
        });
        return result;
    }
    /**
     * Simulate typing presence before sending a message.
     * Shows "typing..." indicator on the recipient's screen.
     */
    async simulateTyping(socket, jid, durationMs) {
        try {
            // Show "composing" (typing) presence
            await socket.sendPresenceUpdate("composing", jid);
            this.logger.info(`Simulating typing for ${durationMs}ms to ${jid}`);
            // Wait for the specified duration
            await new Promise((resolve) => setTimeout(resolve, durationMs));
            // Stop typing indicator (switch to "paused")
            await socket.sendPresenceUpdate("paused", jid);
        }
        catch (err) {
            // Non-critical: log and continue even if presence update fails
            this.logger.warn(`Failed to simulate typing to ${jid}: ${err}`);
        }
    }
    /**
     * Format phone number to WhatsApp JID
     */
    formatJid(phone) {
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
    async shutdown() {
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
let instance = null;
export function getSessionManager(authDir, logLevel, maxIdleTimeSeconds) {
    if (!instance) {
        instance = new BaileysSessionManager(authDir, logLevel, maxIdleTimeSeconds);
    }
    return instance;
}
//# sourceMappingURL=BaileysSession.js.map