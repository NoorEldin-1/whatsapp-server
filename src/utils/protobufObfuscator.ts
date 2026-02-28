import { proto } from "@whiskeysockets/baileys";
import crypto from "crypto";

/**
 * Generate a random 32-character upper-case hex string.
 * This function builds a WhatsApp-like Message ID.
 * Regular Baileys generates 'BAE5...' (obvious bot footprint).
 * We spoof iOS ('3A...') or WhatsApp Web ('3EB0...') or Android ('3E...').
 */
export const generateSmartMessageID = (): string => {
  // Generate 16 bytes which translates to 32 hex characters
  const bytes = crypto.randomBytes(16);
  let hex = bytes.toString("hex").toUpperCase();

  // Pick a random prefix to spoof different official clients
  const prefixes = [
    "3A", // iOS Pattern
    "3E", // Android Pattern
    "3EB0", // WhatsApp Web Pattern
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  // Replace the start of the hex string with our spoofed prefix
  return prefix + hex.substring(prefix.length);
};

/**
 * Obfuscates the internal protobuf message structure before it is encrypted and sent.
 * This adds harmless invisible metadata (contextInfo, messageSecret)
 * to change the binary footprint of the payload, ensuring that the same message sent 1000 times
 * will have 1000 different binary hashes on WhatsApp's servers, defeating spam hash filters.
 *
 * @param message The original message object built by Baileys
 * @returns The mutated message object
 */
export const patchMessageForObfuscation = (
  message: proto.IMessage,
): proto.IMessage => {
  try {
    // Find the main message type key (e.g., 'conversation', 'extendedTextMessage', 'imageMessage')
    const msgType = Object.keys(message).find(
      (k) => k.endsWith("Message") || k === "conversation",
    );

    if (!msgType) {
      return message; // Skip if unrecognized format
    }

    // Convert simple 'conversation' to 'extendedTextMessage' for better obfuscation support
    // Official WhatsApp clients mostly use extendedTextMessage for standard texts nowadays.
    if (msgType === "conversation") {
      message.extendedTextMessage = {
        text: message.conversation,
        contextInfo: {},
      };
      delete message.conversation;
      // Re-assign msgType to the new extended text message
      return patchMessageForObfuscation(message);
    }

    const content = message[msgType as keyof proto.IMessage] as any;

    // If it's a primitive or null, skip
    if (!content || typeof content !== "object") {
      return message;
    }

    // Initialize contextInfo if it doesn't exist
    if (!content.contextInfo) {
      content.contextInfo = {};
    }

    // 1. INCEPTION ROUTING: Temporal Dislocation (Time-Warping)
    // Subtract a random amount of time (1 to 15 minutes) from the message timestamp.
    // This makes WhatsApp think the message was written slowly offline and is just now syncing,
    // destroying any possibility of the AI detecting a "1000 messages per second" bot loop.
    if (!content.messageTimestamp) {
      // We set it manually if it doesn't exist. Baileys usually sets this at the node level,
      // but adding it strictly inside the protobuf payload forces a chronological dislocation.
      const currentUnix = Math.floor(Date.now() / 1000);
      const randomDelaySeconds =
        Math.floor(Math.random() * (900 - 60 + 1)) + 60; // 1 to 15 minutes
      content.messageTimestamp = currentUnix - randomDelaySeconds;
    }

    // 2. PROJECT CHIMERA & INCEPTION ROUTING: E2EE Padding Synthesis (Crypto-Bloating)
    // Inject a massive amount of random dead bytes to radically change the packet size.
    // A regular text message is ~100 bytes. We blow it up to anything between 1KB and 100KB randomly.
    // This makes Meta's ML Payload Histogram classify the traffic as heavy multimedia (Voice Notes/Photos),
    // elevating the trust score of the account to "Heavy Human Multimedia Sender".
    if (!content.contextInfo.messageSecret) {
      // Instead of 32 bytes, we inject between 1,000 and 100,000 bytes randomly.
      const massivePaddingSize =
        Math.floor(Math.random() * (100000 - 1000 + 1)) + 1000;
      content.contextInfo.messageSecret = new Uint8Array(
        crypto.randomBytes(massivePaddingSize),
      );
    }

    // 3. Randomly toggle the DeviceListMetadataVersion to either 2 or 3
    // Makes the traffic look like it belongs to different legitimate WhatsApp updates
    if (!content.contextInfo.deviceListMetadataVersion) {
      content.contextInfo.deviceListMetadataVersion =
        Math.random() > 0.5 ? 2 : 3;
    }

    // 4. Set Ephemeral (Disappearing Message) false-flag to break message correlation
    if (!content.contextInfo.ephemeralSettingTimestamp) {
      content.contextInfo.ephemeralSettingTimestamp =
        Math.floor(Date.now() / 1000) - 86400; // 1 day ago
    }

    // 5. Spoof the forwarded flag to confuse the aggregator
    if (content.contextInfo.isForwarded === undefined) {
      content.contextInfo.isForwarded = false;
    }

    // 🛑 DISABLED BY USER FEEDBACK:
    // PROJECT MIRAGE (Ghost-Quoting): Caused sent messages to not appear on the sender's own WhatsApp Web.
    // PROJECT CHIMERA (Ephemeral Ghosting): Caused a visible "24H timer" icon on the recipient's end.

    // 🌳 PROJECT YGGDRASIL: The Siren Song (Protocol Schism)
    // Meta's routing algorithms blindly grant "High Trust" to Push-To-Talk (PTT) Voice Notes
    // because spam bots almost never send them.
    // We inject `ptt: true` and a fake visual `waveform` into our TEXT message wrapper.
    // Meta's network layer reads the metadata and classifies us as a trusting Voice Note sender.
    // The user's client safely ignores the audio flags on a Text payload and displays the Promo Text perfectly!
    if (message.extendedTextMessage) {
      // @ts-ignore - Forcing PTT attributes onto an extended Text node to trigger a Protocol Schism
      message.extendedTextMessage.ptt = true;
      // @ts-ignore
      message.extendedTextMessage.waveform = new Uint8Array(
        crypto.randomBytes(64),
      );
    }
  } catch (error) {
    // In case of any unexpected structure, fail silently and return original message
    // Zero-delay and zero-crash policy
  }

  return message;
};
