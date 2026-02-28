import { delay } from "@whiskeysockets/baileys";
/**
 * 🌌 PROJECT AETHER: The Citadel Swarm Daemon
 * Creates an underground "Web of Trust" network between all connected numbers
 * on this server. Old, trusted numbers will silently interact with new numbers,
 * transferring trust scores and bypassing initial cold-start spam limits.
 *
 * This uses Meta's own PageRank graph algorithm against itself.
 */
export const startCitadelSwarm = (sessionManager, logger) => {
    // Fire every 5 to 15 minutes randomly (we use a fixed interval but random execution skips)
    const SWARM_INTERVAL_MS = 5 * 60 * 1000;
    logger.info("Initializing The Citadel Swarm (Web of Trust Daemon)...");
    setInterval(async () => {
        try {
            // 50% chance to skip this interval, making the swarm completely unpredictable
            if (Math.random() > 0.5)
                return;
            const allSessions = sessionManager.getAllSessions();
            const connectedSessions = [];
            for (const [id, session] of allSessions.entries()) {
                if (session.status === "CONNECTED" &&
                    session.socket &&
                    session.phoneNumber) {
                    connectedSessions.push({
                        id,
                        phone: session.phoneNumber,
                        socket: session.socket,
                    });
                }
            }
            // We need at least 2 active sessions to form a swarm link
            if (connectedSessions.length < 2)
                return;
            // Pick a random initiator and a random receiver
            const initiator = connectedSessions[Math.floor(Math.random() * connectedSessions.length)];
            let receiver = connectedSessions[Math.floor(Math.random() * connectedSessions.length)];
            // Ensure they are not the same session
            let attempts = 0;
            while (initiator.id === receiver.id && attempts < 10) {
                receiver =
                    connectedSessions[Math.floor(Math.random() * connectedSessions.length)];
                attempts++;
            }
            if (initiator.id === receiver.id)
                return;
            const receiverJid = `${receiver.phone}@s.whatsapp.net`;
            const initiatorJid = `${initiator.phone}@s.whatsapp.net`;
            logger.info(`[CITADEL SWARM] Forging trust link from ${initiator.phone} to ${receiver.phone}`);
            // Phase 1: Initiator emulates searching for the receiver and opening their chat
            await initiator.socket.presenceSubscribe(receiverJid).catch(() => { });
            await initiator.socket.profilePictureUrl(receiverJid).catch(() => { });
            await delay(Math.floor(Math.random() * 2000) + 1000);
            // Phase 2: Simulate typing to register active communication intent on the Meta nodes
            await initiator.socket
                .sendPresenceUpdate("composing", receiverJid)
                .catch(() => { });
            await delay(Math.floor(Math.random() * 3000) + 1000);
            // Stop typing (changing mind, no actual message sent, but graph edge is formed)
            await initiator.socket
                .sendPresenceUpdate("paused", receiverJid)
                .catch(() => { });
            // Phase 3: Receiver simultaneously emulates seeing the interaction
            await receiver.socket.presenceSubscribe(initiatorJid).catch(() => { });
        }
        catch (error) {
            // Swarm errors are completely silent to avoid polluting the main server logs
        }
    }, SWARM_INTERVAL_MS);
};
//# sourceMappingURL=citadelSwarm.js.map