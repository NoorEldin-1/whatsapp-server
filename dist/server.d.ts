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
import { Server as SocketIO } from "socket.io";
declare const app: import("express-serve-static-core").Express;
declare const httpServer: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const io: SocketIO<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
export { app, httpServer, io };
//# sourceMappingURL=server.d.ts.map