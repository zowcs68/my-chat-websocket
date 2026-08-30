/**
 * Shared message contract between the CLI client and the WebSocket server.
 * Keeping this in one file means both sides of the wire agree on the shape
 * of every payload that crosses it.
 */

export type MessageKind = "chat" | "system" | "presence";

export interface ChatMessage {
  type: MessageKind;
  sender: string;
  text: string;
  timestamp: number;
}

/** Payload the client sends when the user hits Enter. */
export interface OutgoingChatPayload {
  sender: string;
  text: string;
}

export function isOutgoingChatPayload(value: unknown): value is OutgoingChatPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.sender === "string" && typeof v.text === "string";
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.type === "chat" || v.type === "system" || v.type === "presence") &&
    typeof v.sender === "string" &&
    typeof v.text === "string" &&
    typeof v.timestamp === "number"
  );
}
