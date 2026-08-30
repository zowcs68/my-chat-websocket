import { EventEmitter } from "node:events";
import { isChatMessage, type ChatMessage, type OutgoingChatPayload } from "../shared/types";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface ChatSocketOptions {
  url: string;
  /** Base delay (ms) for the first reconnect attempt. Doubles every attempt. */
  baseReconnectDelayMs?: number;
  /** Upper bound (ms) that the exponential backoff will not exceed. */
  maxReconnectDelayMs?: number;
}

export interface ChatSocketEvents {
  state: (state: ConnectionState) => void;
  message: (message: ChatMessage) => void;
}

/**
 * Thin wrapper around the standard WebSocket API (available natively in Bun)
 * that adds:
 *  - typed connection-state events the UI can subscribe to
 *  - JSON encode/decode of ChatMessage payloads
 *  - automatic reconnection with exponential backoff on unexpected drops
 */
export class ChatSocket extends EventEmitter {
  private readonly url: string;
  private readonly baseDelay: number;
  private readonly maxDelay: number;

  private socket: WebSocket | null = null;
  private state: ConnectionState = "connecting";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;

  constructor(options: ChatSocketOptions) {
    super();
    this.url = options.url;
    this.baseDelay = options.baseReconnectDelayMs ?? 500;
    this.maxDelay = options.maxReconnectDelayMs ?? 15_000;
  }

  /** Opens the connection (or the next reconnect attempt). Safe to call once at startup. */
  connect(): void {
    this.manuallyClosed = false;
    this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.setState("open");
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      try {
        const parsed = JSON.parse(raw);
        if (isChatMessage(parsed)) {
          this.emit("message", parsed);
          return;
        }
      } catch {
        // fall through to raw text handling below
      }
      this.emit("message", {
        type: "system",
        sender: "system",
        text: raw,
        timestamp: Date.now(),
      } satisfies ChatMessage);
    });

    socket.addEventListener("close", () => {
      this.socket = null;
      if (this.manuallyClosed) {
        this.setState("closed");
        return;
      }
      this.scheduleReconnect();
    });

    // The 'close' event always follows 'error' for browser/Bun WebSockets,
    // so reconnect scheduling stays centralized in the close handler.
    socket.addEventListener("error", () => {});
  }

  /** Sends an outgoing chat payload if the socket is open. Returns false if it could not be sent. */
  send(text: string): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const payload: OutgoingChatPayload = {
        sender: this.currentSender,
        text,
      };
      this.socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  currentSender = "guest";

  /** Permanently closes the socket and cancels any pending reconnect attempts. */
  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.setState("closed");
  }

  getState(): ConnectionState {
    return this.state;
  }

  private scheduleReconnect(): void {
    this.setState("reconnecting");
    const delay = Math.min(this.baseDelay * 2 ** this.reconnectAttempt, this.maxDelay);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.manuallyClosed) this.connect();
    }, delay);
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit("state", state);
  }

  // Typed overrides for on/off/emit so consumers get autocomplete instead of `any`.
  override on<K extends keyof ChatSocketEvents>(event: K, listener: ChatSocketEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  override off<K extends keyof ChatSocketEvents>(event: K, listener: ChatSocketEvents[K]): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }
  override emit<K extends keyof ChatSocketEvents>(event: K, ...args: Parameters<ChatSocketEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}
