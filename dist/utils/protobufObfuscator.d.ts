import { proto } from "@whiskeysockets/baileys";
/**
 * Generate a random 32-character upper-case hex string.
 * This function builds a WhatsApp-like Message ID.
 * Regular Baileys generates 'BAE5...' (obvious bot footprint).
 * We spoof iOS ('3A...') or WhatsApp Web ('3EB0...') or Android ('3E...').
 */
export declare const generateSmartMessageID: () => string;
/**
 * Obfuscates the internal protobuf message structure before it is encrypted and sent.
 * This adds harmless invisible metadata (contextInfo, messageSecret)
 * to change the binary footprint of the payload, ensuring that the same message sent 1000 times
 * will have 1000 different binary hashes on WhatsApp's servers, defeating spam hash filters.
 *
 * @param message The original message object built by Baileys
 * @returns The mutated message object
 */
export declare const patchMessageForObfuscation: (message: proto.IMessage) => proto.IMessage;
//# sourceMappingURL=protobufObfuscator.d.ts.map