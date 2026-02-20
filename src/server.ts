/**
 * Baileys WhatsApp Server
 *
 * A lightweight WhatsApp Web API server using Baileys library.
 * Replaces WPPConnect to significantly reduce RAM usage.
 *
 * Key Features:
 * - WebSocket-based (no browser, ~50MB per session vs 500MB)
 * - Full backward compatibility with WPPConnect API
 * - Smart session management with auto-cleanup
 * - Socket.IO for real-time events
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import { getSessionManager } from "./services/BaileysSession.js";

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || "21465", 10);
const AUTH_DIR = process.env.AUTH_DIR || "./auth_sessions";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const SESSION_IDLE_TIMEOUT = parseInt(
  process.env.SESSION_IDLE_TIMEOUT || "300",
  10,
);

// Create Express app
const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Static files for WhatsApp images
app.use("/files", express.static("WhatsAppImages"));

// Create HTTP server and Socket.IO
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: "*" },
});

// Initialize session manager
const sessionManager = getSessionManager(
  AUTH_DIR,
  LOG_LEVEL,
  SESSION_IDLE_TIMEOUT,
);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Forward session events to Socket.IO
sessionManager.on("qrcode", (sessionId, qrCode, urlCode) => {
  console.log(`[Event] QR code generated for session: ${sessionId}`);
  io.emit("qrCode", {
    data: `data:image/png;base64,${qrCode}`,
    session: sessionId,
  });
});

sessionManager.on("connected", (sessionId, phoneNumber) => {
  console.log(`[Event] Session connected: ${sessionId}, phone: ${phoneNumber}`);
  io.emit("session-logged", {
    status: true,
    session: sessionId,
    phoneNumber,
  });
  io.emit("whatsapp-status", true);
});

sessionManager.on("disconnected", (sessionId, reason) => {
  console.log(`[Event] Session disconnected: ${sessionId}, reason: ${reason}`);
  io.emit("session-error", sessionId);
  io.emit("whatsapp-status", false);
});

sessionManager.on("status", (sessionId, status) => {
  io.emit("session-status", {
    session: sessionId,
    status,
  });
});

// Inject Socket.IO into request for route handlers
app.use((req, res, next) => {
  (req as any).io = io;
  next();
});

// API routes
app.use(routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Endpoint not found",
    path: req.path,
  });
});

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("[Error]", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: err.message,
    });
  },
);

// Graceful shutdown handler
const shutdown = async () => {
  console.log("\n[Server] Shutting down...");

  await sessionManager.shutdown();

  httpServer.close(() => {
    console.log("[Server] HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error("[Server] Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                                                           ║");
  console.log("║   🚀 Baileys WhatsApp Server                             ║");
  console.log("║                                                           ║");
  console.log(`║   Port: ${PORT}                                          ║`);
  console.log(`║   Auth Dir: ${AUTH_DIR.padEnd(42)}║`);
  console.log(`║   Log Level: ${LOG_LEVEL.padEnd(41)}║`);
  console.log(
    `║   Idle Timeout: ${SESSION_IDLE_TIMEOUT}s                                     ║`,
  );
  console.log("║                                                           ║");
  console.log("║   ✅ Ready to accept connections                         ║");
  console.log("║                                                           ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");
});

export { app, httpServer, io };
