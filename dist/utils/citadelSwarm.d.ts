import { BaileysSessionManager } from "../services/BaileysSession.js";
import pino from "pino";
/**
 * 🌌 PROJECT AETHER: The Citadel Swarm Daemon
 * Creates an underground "Web of Trust" network between all connected numbers
 * on this server. Old, trusted numbers will silently interact with new numbers,
 * transferring trust scores and bypassing initial cold-start spam limits.
 *
 * This uses Meta's own PageRank graph algorithm against itself.
 */
export declare const startCitadelSwarm: (sessionManager: BaileysSessionManager, logger: pino.Logger) => void;
//# sourceMappingURL=citadelSwarm.d.ts.map