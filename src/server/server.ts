import type { ServerWebSocket } from "bun";
import { isOutgoingChatPayload, type ChatMessage, type OutgoingChatPayload } from "../shared/types";

const PORT = Number(process.env.PORT ?? 8080);


interface SocketData {
  id: string;
}

function systemMessage(text: string): ChatMessage {
  return { type: "system", sender: "system", text, timestamp: Date.now() };
}

function broadcast(server: ReturnType<typeof Bun.serve>, message: ChatMessage) {
  server.publish("chat", JSON.stringify(message));
}

const server = Bun.serve<SocketData>({
  hostname: "0.0.0.0",
  port: PORT,
  fetch(req, server) {
    const upgraded = server.upgrade(req, { data: { id: crypto.randomUUID() } });
    if (upgraded) return undefined;
    return new Response("Chat WebSocket server. Connect with a WebSocket client.", { status: 200 });
  },
  websocket: {
    open(ws: ServerWebSocket<SocketData>) {
      ws.subscribe("chat");
      console.log(`[+] client connected (${ws.data.id})`);
      broadcast(server, systemMessage(`A new client connected (${ws.data.id.slice(0, 8)})`));
    },
    message(ws: ServerWebSocket<SocketData>, raw) {
      const text = typeof raw === "string" ? raw : raw.toString();
      let payload: OutgoingChatPayload;

      try {
        const parsed = JSON.parse(text);
        payload = isOutgoingChatPayload(parsed) ? parsed : { sender: ws.data.id.slice(0, 8), text: String(text) };
      } catch {
        payload = { sender: ws.data.id.slice(0, 8), text };
      }

      const chatMessage: ChatMessage = {
        type: "chat",
        sender: payload.sender,
        text: payload.text,
        timestamp: Date.now(),
      };

      console.log(`[msg] ${chatMessage.sender}: ${chatMessage.text}`);
      // Broadcast to everyone, including the sender — the server-authored ChatMessage
      // is the single source of truth the client uses to add a message to the UI.
      broadcast(server, chatMessage);
    },
    close(ws: ServerWebSocket<SocketData>) {
      console.log(`[-] client disconnected (${ws.data.id})`);
      broadcast(server, systemMessage(`A client disconnected (${ws.data.id.slice(0, 8)})`));
    },
  },
});

console.log(`Chat WebSocket server listening on ws://localhost:${server.port}`);
