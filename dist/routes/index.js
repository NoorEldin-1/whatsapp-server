/**
 * Express API Routes for Baileys WhatsApp Server
 *
 * Maintains backward compatibility with WPPConnect API endpoints.
 * All routes match the existing Laravel integration.
 */
import fs from "fs";
import { Router } from "express";
import bcrypt from "bcrypt";
import { getSessionManager, } from "../services/BaileysSession.js";
const router = Router();
// Environment configuration
const SECRET_KEY = process.env.SECRET_KEY || "THISISMYSECURETOKEN";
const AUTH_DIR = process.env.AUTH_DIR || "./auth_sessions";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const SESSION_IDLE_TIMEOUT = parseInt(process.env.SESSION_IDLE_TIMEOUT || "300", 10);
// Get session manager singleton
const sessionManager = getSessionManager(AUTH_DIR, LOG_LEVEL, SESSION_IDLE_TIMEOUT);
// In-memory token storage (matches WPPConnect behavior)
// In production, consider using Redis for persistence across restarts
// Token persistence
const TOKENS_FILE = "./tokens.json";
let tokens = new Map();
// Load tokens from file
try {
    if (fs.existsSync(TOKENS_FILE)) {
        const data = fs.readFileSync(TOKENS_FILE, "utf8");
        const json = JSON.parse(data);
        tokens = new Map(Object.entries(json));
        console.log(`[Tokens] Loaded ${tokens.size} tokens from disk`);
    }
}
catch (err) {
    console.error("[Tokens] Failed to load tokens:", err);
}
// Helper to save tokens
const saveTokens = () => {
    try {
        const obj = Object.fromEntries(tokens);
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(obj, null, 2));
    }
    catch (err) {
        console.error("[Tokens] Failed to save tokens:", err);
    }
};
/**
 * Middleware: Extract session from params
 */
const extractSession = (req, res, next) => {
    const session = req.params.session;
    if (!session) {
        res
            .status(400)
            .json({ status: "error", message: "Session name is required" });
        return;
    }
    req.sessionName = session;
    next();
};
/**
 * Middleware: Verify Bearer token
 */
const verifyToken = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
        res
            .status(401)
            .json({ status: "error", message: "Authorization token required" });
        return;
    }
    const token = auth.replace("Bearer ", "");
    const session = req.sessionName || req.params.session;
    // Check if token exists for this session
    const storedToken = tokens.get(session);
    if (!storedToken) {
        res
            .status(401)
            .json({ status: "error", message: "No token found for session" });
        return;
    }
    // Verify token matches
    if (token !== storedToken) {
        res.status(401).json({ status: "error", message: "Invalid token" });
        return;
    }
    next();
};
// ============================================================================
// AUTH ROUTES
// ============================================================================
/**
 * Generate authentication token for a session
 * POST /api/:session/:secretKey/generate-token
 */
router.post("/api/:session/:secretKey/generate-token", extractSession, async (req, res) => {
    const { secretKey } = req.params;
    const session = req.sessionName;
    // Validate secret key
    if (secretKey !== SECRET_KEY) {
        res.status(401).json({
            status: "error",
            message: "Invalid secret key",
        });
        return;
    }
    try {
        // Generate a unique token (hash of session + timestamp + random)
        const tokenBase = `${session}-${Date.now()}-${Math.random()}`;
        const token = await bcrypt.hash(tokenBase, 10);
        // Store token
        tokens.set(session, token);
        saveTokens();
        console.log(`[Token] Generated for session: ${session}`);
        res.json({
            status: "success",
            session,
            token,
        });
    }
    catch (error) {
        console.error(`[Token] Generation error:`, error);
        res.status(500).json({
            status: "error",
            message: "Failed to generate token",
        });
    }
});
// ============================================================================
// SESSION ROUTES
// ============================================================================
/**
 * Get active chats for a session
 * GET /api/:session/chats
 */
router.get("/api/:session/chats", extractSession, verifyToken, (req, res) => {
    const session = req.sessionName;
    try {
        const chats = sessionManager.getChats(session);
        res.json({
            status: "success",
            response: chats,
        });
    }
    catch (error) {
        console.error(`[Session] Get chats error:`, error);
        res.status(500).json({
            status: "error",
            message: "Failed to get chats",
        });
    }
});
/**
 * Start a session and get QR code if needed
 * POST /api/:session/start-session
 */
router.post("/api/:session/start-session", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { waitQrCode = true } = req.body;
    try {
        console.log(`[Session] Starting: ${session}, waitQrCode: ${waitQrCode}`);
        const sessionInfo = await sessionManager.startSession(session, waitQrCode);
        // Map status to WPPConnect format
        let status = sessionInfo.status;
        if (status === "QRCODE" && sessionInfo.qrCode) {
            res.json({
                status: "qrcode",
                qrcode: sessionInfo.qrCode,
                urlcode: sessionInfo.urlCode,
                session,
            });
            return;
        }
        if (status === "CONNECTED") {
            res.json({
                status: "CONNECTED",
                session,
                message: "Session already connected",
                reused: true,
            });
            return;
        }
        // Session is initializing or other state
        res.json({
            status: status,
            session,
            qrcode: sessionInfo.qrCode,
            message: "Session is starting...",
        });
    }
    catch (error) {
        console.error(`[Session] Start error:`, error);
        res.status(500).json({
            status: "error",
            message: "Failed to start session",
            error: String(error),
        });
    }
});
/**
 * Request pairing code for linking via phone number
 * POST /api/:session/pair-code
 */
router.post("/api/:session/pair-code", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        res.status(400).json({
            status: "error",
            message: "Phone number is required",
        });
        return;
    }
    try {
        console.log(`[Session] Requesting pairing code for: ${session}, phone: ${phoneNumber}`);
        // Start session with phone number for pairing code method
        const sessionInfo = await sessionManager.startSession(session, false, // Don't wait for QR
        phoneNumber);
        if (sessionInfo.pairingCode) {
            res.json({
                status: "success",
                session,
                pairingCode: sessionInfo.pairingCode,
                message: "Pairing code generated successfully",
            });
        }
        else {
            res.status(500).json({
                status: "error",
                message: "Failed to generate pairing code - no code returned",
            });
        }
    }
    catch (error) {
        console.error(`[Session] Pairing code error:`, error);
        res.status(500).json({
            status: "error",
            message: error.message || "Failed to generate pairing code",
            error: String(error),
        });
    }
});
/**
 * Check connection status
 * GET /api/:session/check-connection-session
 */
router.get("/api/:session/check-connection-session", extractSession, verifyToken, (req, res) => {
    const session = req.sessionName;
    const sessionInfo = sessionManager.getSession(session);
    // If session is in PAIRING mode (waiting for user to enter code)
    // Don't return connected yet - user still needs to complete pairing
    if (sessionInfo?.status === "PAIRING") {
        res.json({
            status: false,
            message: "PAIRING",
            pairingCode: sessionInfo.pairingCode,
        });
        return;
    }
    // If session exists in memory and is connected
    if (sessionInfo?.status === "CONNECTED") {
        res.json({
            status: true,
            message: "Connected",
        });
        return;
    }
    // Check if session has auth state (paired but sleeping)
    if (sessionManager.hasAuthState(session)) {
        res.json({
            status: true,
            message: "PAIRED",
        });
        return;
    }
    res.json({
        status: false,
        message: "Disconnected",
    });
});
/**
 * Get detailed session status
 * GET /api/:session/status-session
 */
router.get("/api/:session/status-session", extractSession, verifyToken, (req, res) => {
    const session = req.sessionName;
    const sessionInfo = sessionManager.getSession(session);
    if (!sessionInfo) {
        // Check if session has auth state (paired but sleeping)
        if (sessionManager.hasAuthState(session)) {
            res.json({
                status: "PAIRED",
                qrcode: null,
                urlcode: null,
                message: "Session is sleeping",
            });
            return;
        }
        res.json({
            status: "CLOSED",
            qrcode: null,
            urlcode: null,
        });
        return;
    }
    res.json({
        status: sessionInfo.status,
        qrcode: sessionInfo.qrCode,
        urlcode: sessionInfo.urlCode,
    });
});
/**
 * Get phone number from active session (direct match for WPPConnect)
 * GET /api/:session/get-phone-number
 */
router.get("/api/:session/get-phone-number", extractSession, verifyToken, (req, res) => {
    const session = req.sessionName;
    const sessionInfo = sessionManager.getSession(session);
    // Priority 1: Check manually set phone number
    if (sessionInfo?.phoneNumber) {
        res.json({
            status: "success",
            response: { phoneNumber: sessionInfo.phoneNumber },
            mapper: "session",
        });
        return;
    }
    // Priority 2: Check socket auth state (Most reliable source)
    const authPhone = sessionInfo?.socket?.authState?.creds?.me?.id;
    if (authPhone) {
        const formatted = authPhone.split(":")[0].split("@")[0];
        // Update cache
        if (sessionInfo)
            sessionInfo.phoneNumber = formatted;
        res.json({
            status: "success",
            response: { phoneNumber: formatted },
            mapper: "socket_auth",
        });
        return;
    }
    // Priority 3: Check stored file as fallback
    const storedPhone = sessionManager.getStoredPhoneNumber(session);
    if (storedPhone) {
        res.json({
            status: "success",
            response: { phoneNumber: storedPhone },
            mapper: "file",
        });
        return;
    }
    res.status(404).json({
        status: "error",
        message: "Phone number not found (session not connected or number not retrieved yet)",
    });
});
/**
 * Get stored phone number
 * GET /api/:session/get-stored-phone
 */
router.get("/api/:session/get-stored-phone", extractSession, verifyToken, (req, res) => {
    const session = req.sessionName;
    // First check active session
    const sessionInfo = sessionManager.getSession(session);
    if (sessionInfo?.phoneNumber) {
        res.json({
            status: "success",
            response: { phoneNumber: sessionInfo.phoneNumber },
            mapper: "session",
        });
        return;
    }
    // Check stored file
    const storedPhone = sessionManager.getStoredPhoneNumber(session);
    if (storedPhone) {
        res.json({
            status: "success",
            response: { phoneNumber: storedPhone },
            mapper: "file",
        });
        return;
    }
    res.status(404).json({
        status: "error",
        message: "Phone number not found for this session",
    });
});
/**
 * Close session (keep auth state)
 * POST /api/:session/close-session
 */
router.post("/api/:session/close-session", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    try {
        const success = await sessionManager.closeSession(session);
        res.json({
            status: true,
            message: success
                ? "Session successfully closed"
                : "Session already closed",
        });
    }
    catch (error) {
        console.error(`[Session] Close error:`, error);
        res.status(500).json({
            status: false,
            message: "Error closing session",
        });
    }
});
/**
 * Logout and delete all session data
 * POST /api/:session/logout-session
 */
router.post("/api/:session/logout-session", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    try {
        await sessionManager.logoutSession(session);
        // Also remove token
        tokens.delete(session);
        saveTokens();
        res.json({
            status: true,
            message: "Session successfully logged out and cleaned",
        });
    }
    catch (error) {
        console.error(`[Session] Logout error:`, error);
        res.status(500).json({
            status: false,
            message: "Error during logout",
            error: String(error),
        });
    }
});
// ============================================================================
// CHATS ROUTES
// ============================================================================
/**
 * Get active chats
 * GET /api/:session/chats
 */
router.get("/api/:session/chats", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    try {
        const sessionInfo = sessionManager.getSession(session);
        if (!sessionInfo || sessionInfo.status !== "CONNECTED") {
            res.status(404).json({
                status: "error",
                message: "Session is not connected",
            });
            return;
        }
        let chats = sessionManager.getChats(session);
        // If chats are empty, attempt to force an active sync using app-state
        if (chats.length === 0 && sessionInfo.socket) {
            try {
                console.log(`[Chats] Forcing chat fetch for empty session ${session}`);
                await sessionManager.forceFetchChats(session);
                chats = sessionManager.getChats(session);
            }
            catch (e) {
                console.log(`[Chats] Failed to force fetch: `, e);
            }
        }
        res.json({
            status: "success",
            response: chats,
        });
    }
    catch (error) {
        console.error(`[Chats] Get error:`, error);
        res.status(500).json({
            status: "error",
            message: "Failed to get chats",
            error: String(error),
        });
    }
});
// ============================================================================
// GROUPS ROUTES
// ============================================================================
/**
 * Get all groups
 * GET /api/:session/groups
 */
router.get("/api/:session/groups", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    try {
        const groups = await sessionManager.getGroups(session);
        res.json({
            status: "success",
            response: groups,
        });
    }
    catch (error) {
        console.error(`[Groups] Get error:`, error);
        res.status(500).json({
            status: "error",
            message: "Failed to get groups",
            error: String(error),
        });
    }
});
/**
 * Extract contacts from groups
 * POST /api/:session/groups/extract
 */
router.post("/api/:session/groups/extract", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { groupIds } = req.body;
    if (!groupIds || !Array.isArray(groupIds)) {
        res.status(400).json({
            status: "error",
            message: "groupIds array is required",
        });
        return;
    }
    try {
        const contacts = await sessionManager.extractGroupsContacts(session, groupIds);
        res.json({
            status: "success",
            response: contacts,
        });
    }
    catch (error) {
        console.error(`[Groups] Extract error:`, error);
        res.status(500).json({
            status: "error",
            message: "Failed to extract groups contacts",
            error: String(error),
        });
    }
});
// ============================================================================
// MESSAGE ROUTES
// ============================================================================
/**
 * Send text message
 * POST /api/:session/send-message
 */
router.post("/api/:session/send-message", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { phone, message, typingTime } = req.body;
    if (!phone || !message) {
        res.status(400).json({
            status: "Error",
            message: "Phone and message are required",
        });
        return;
    }
    try {
        // Handle single or array of phones
        const phones = Array.isArray(phone) ? phone : [phone];
        const results = [];
        const typing = typeof typingTime === "number" ? typingTime : 0;
        for (const p of phones) {
            const result = await sessionManager.sendMessage(session, p, message, typing);
            results.push(result);
        }
        res.status(201).json({
            status: "success",
            response: results,
            mapper: "return",
        });
    }
    catch (error) {
        console.error(`[Message] Send error:`, error);
        // Check for disconnection-related errors
        if (error.message?.includes("not connected") ||
            error.message?.includes("not found")) {
            res.status(404).json({
                status: "Error",
                message: "Session disconnected",
                error: error.message,
            });
            return;
        }
        res.status(500).json({
            status: "Error",
            message: "Failed to send message",
            error: error.message || String(error),
        });
    }
});
/**
 * Send image with caption
 * POST /api/:session/send-image
 */
router.post("/api/:session/send-image", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { phone, caption, base64, filename, typingTime } = req.body;
    if (!phone || !base64) {
        res.status(400).json({
            status: "Error",
            message: "Phone and base64 image are required",
        });
        return;
    }
    try {
        // Extract base64 data (handle data URL format)
        let base64Data = base64;
        let mimeType = "image/jpeg";
        const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
            mimeType = dataUrlMatch[1];
            base64Data = dataUrlMatch[2];
        }
        const imageBuffer = Buffer.from(base64Data, "base64");
        // Handle single or array of phones
        const phones = Array.isArray(phone) ? phone : [phone];
        const results = [];
        const typing = typeof typingTime === "number" ? typingTime : 0;
        for (const p of phones) {
            const result = await sessionManager.sendImage(session, p, imageBuffer, caption || "", mimeType, typing);
            results.push(result);
        }
        res.status(201).json({
            status: "success",
            response: results,
            mapper: "return",
        });
    }
    catch (error) {
        console.error(`[Image] Send error:`, error);
        if (error.message?.includes("not connected") ||
            error.message?.includes("not found")) {
            res.status(404).json({
                status: "Error",
                message: "Session disconnected",
                error: error.message,
            });
            return;
        }
        res.status(500).json({
            status: "Error",
            message: "Failed to send image",
            error: error.message || String(error),
        });
    }
});
/**
 * Send file/document
 * POST /api/:session/send-file
 */
router.post("/api/:session/send-file", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { phone, base64, filename, caption, message } = req.body;
    if (!phone || !base64) {
        res.status(400).json({
            status: "Error",
            message: "Phone and base64 file are required",
        });
        return;
    }
    try {
        // Extract base64 data
        let base64Data = base64;
        let mimeType = "application/octet-stream";
        const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
            mimeType = dataUrlMatch[1];
            base64Data = dataUrlMatch[2];
        }
        const fileBuffer = Buffer.from(base64Data, "base64");
        const finalCaption = caption || message || "";
        // Handle single or array of phones
        const phones = Array.isArray(phone) ? phone : [phone];
        const results = [];
        for (const p of phones) {
            const result = await sessionManager.sendFile(session, p, fileBuffer, filename || "file", finalCaption, mimeType);
            results.push(result);
        }
        res.status(201).json({
            status: "success",
            response: results,
            mapper: "return",
        });
    }
    catch (error) {
        console.error(`[File] Send error:`, error);
        if (error.message?.includes("not connected") ||
            error.message?.includes("not found")) {
            res.status(404).json({
                status: "Error",
                message: "Session disconnected",
                error: error.message,
            });
            return;
        }
        res.status(500).json({
            status: "Error",
            message: "Failed to send file",
            error: error.message || String(error),
        });
    }
});
/**
 * Send video with caption
 * POST /api/:session/send-video
 */
router.post("/api/:session/send-video", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { phone, base64, filename, caption, message, typingTime } = req.body;
    if (!phone || !base64) {
        res.status(400).json({
            status: "Error",
            message: "Phone and base64 video are required",
        });
        return;
    }
    try {
        // Extract base64 data
        let base64Data = base64;
        let mimeType = "video/mp4";
        const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
            mimeType = dataUrlMatch[1];
            base64Data = dataUrlMatch[2];
        }
        const videoBuffer = Buffer.from(base64Data, "base64");
        const finalCaption = caption || message || "";
        // Handle single or array of phones
        const phones = Array.isArray(phone) ? phone : [phone];
        const results = [];
        const typing = typeof typingTime === "number" ? typingTime : 0;
        for (const p of phones) {
            const result = await sessionManager.sendVideo(session, p, videoBuffer, finalCaption, mimeType, typing);
            results.push(result);
        }
        res.status(201).json({
            status: "success",
            response: results,
            mapper: "return",
        });
    }
    catch (error) {
        console.error(`[Video] Send error:`, error);
        if (error.message?.includes("not connected") ||
            error.message?.includes("not found")) {
            res.status(404).json({
                status: "Error",
                message: "Session disconnected",
                error: error.message,
            });
            return;
        }
        res.status(500).json({
            status: "Error",
            message: "Failed to send video",
            error: error.message || String(error),
        });
    }
});
/**
 * Send poll message (Anti-Ban: Auto-Poll Tactic)
 * POST /api/:session/send-poll
 */
router.post("/api/:session/send-poll", extractSession, verifyToken, async (req, res) => {
    const session = req.sessionName;
    const { phone, name, options } = req.body;
    if (!phone || !name || !Array.isArray(options) || options.length < 2) {
        res.status(400).json({
            status: "Error",
            message: "Phone, name (poll question), and options (array with at least 2 items) are required",
        });
        return;
    }
    try {
        const result = await sessionManager.sendPoll(session, phone, name, options);
        res.status(201).json({
            status: "success",
            response: result,
            mapper: "return",
        });
    }
    catch (error) {
        console.error(`[Poll] Send error:`, error);
        if (error.message?.includes("not connected") ||
            error.message?.includes("not found")) {
            res.status(404).json({
                status: "Error",
                message: "Session disconnected",
                error: error.message,
            });
            return;
        }
        res.status(500).json({
            status: "Error",
            message: "Failed to send poll",
            error: error.message || String(error),
        });
    }
});
// ============================================================================
// ADMIN ROUTES
// ============================================================================
/**
 * Show all active sessions
 * GET /api/show-all-sessions/:secretKey
 */
router.get("/api/show-all-sessions/:secretKey", (req, res) => {
    const { secretKey } = req.params;
    if (secretKey !== SECRET_KEY) {
        res.status(401).json({
            response: false,
            message: "Invalid secret key",
        });
        return;
    }
    const sessions = sessionManager.getAllSessions();
    const sessionList = [];
    for (const [name, info] of sessions) {
        if (info.status !== "CLOSED") {
            sessionList.push(name);
        }
    }
    res.json({ response: sessionList });
});
/**
 * Health check endpoint
 */
router.get("/health", (req, res) => {
    res.json({
        status: "ok",
        server: "baileys-whatsapp-server",
        activeSessions: sessionManager.getActiveSessionCount(),
        uptime: process.uptime(),
    });
});
export default router;
//# sourceMappingURL=index.js.map