import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { ChatSocket, type ConnectionState } from "./chat-socket";
import type { ChatMessage } from "../shared/types";

const WS_URL = process.env.CHAT_WS_URL ?? "ws://localhost:8080";
const HANDLE = process.env.CHAT_HANDLE ?? `guest-${Math.random().toString(36).slice(2, 6)}`;

const PALETTE = {
  bg: "#1a1b26",
  panel: "#16161e",
  border: "#3b4261",
  text: "#c0caf5",
  dim: "#565f89",
  own: "#7aa2f7",
  other: "#9ece6a",
  ownBubble: "#283457",
  otherBubble: "#1f2937",
  system: "#e0af68",
  error: "#f7768e",
} as const;

const STATE_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  open: "Connected",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

const STATE_COLOR: Record<ConnectionState, string> = {
  connecting: PALETTE.system,
  open: PALETTE.other,
  reconnecting: PALETTE.system,
  closed: PALETTE.error,
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function MessageRow(props: { message: ChatMessage; own: boolean }) {
  const isSystem = () => props.message.type === "system" || props.message.type === "presence";

  return (
    <Show
      when={!isSystem()}
      fallback={
        <text height={1} width="100%" wrapMode="word">
          <span style={{ fg: PALETTE.dim }}>{`[${formatTime(props.message.timestamp)}] `}</span>
          <span style={{ fg: PALETTE.system }}>{`* ${props.message.text}`}</span>
        </text>
      }
    >
      {/* Full-width row that pushes the bubble to the right (own) or left (others) */}
      <box width="100%" flexDirection="row" justifyContent={props.own ? "flex-end" : "flex-start"} marginBottom={1}>
        <box
          width="auto"
          maxWidth="70%"
          flexDirection="column"
          border
          borderColor={props.own ? PALETTE.own : PALETTE.other}
          backgroundColor={props.own ? PALETTE.ownBubble : PALETTE.otherBubble}
          paddingX={1}
        >
          <Show when={!props.own}>
            <text fg={PALETTE.other} wrapMode="word">
              {props.message.sender}
            </text>
          </Show>
          <text fg={PALETTE.text} wrapMode="word">
            {props.message.text}
          </text>
          <text fg={PALETTE.dim}>{formatTime(props.message.timestamp)}</text>
        </box>
      </box>
    </Show>
  );
}

export function App() {
  const dimensions = useTerminalDimensions();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = createSignal<ConnectionState>("connecting");
  const [inputValue, setInputValue] = createSignal("");

  const socket = new ChatSocket({ url: WS_URL });
  socket.currentSender = HANDLE;

  const pushMessage = (message: ChatMessage) => setMessages((prev) => [...prev, message]);

  socket.on("state", (state: ConnectionState) => {
    setConnectionState(state);
    if (state === "open") {
      pushMessage({ type: "system", sender: "system", text: `Connected as ${HANDLE}`, timestamp: Date.now() });
    } else if (state === "reconnecting") {
      pushMessage({ type: "system", sender: "system", text: "Connection lost, reconnecting…", timestamp: Date.now() });
    }
  });
  socket.on("message", pushMessage);

  onMount(() => {
    pushMessage({
      type: "system",
      sender: "system",
      text: `Connecting to ${WS_URL} as ${HANDLE}…`,
      timestamp: Date.now(),
    });
    socket.connect();
  });

  onCleanup(() => {
    socket.close();
  });

  const quit = () => {
    socket.close();
    process.exit(0);
  };

  useKeyboard((key) => {
    if (key.name === "escape") {
      quit();
    }
  });

  const handleSubmit = () => {
    const text = inputValue().trim();
    setInputValue("");
    if (!text) return;

    const delivered = socket.send(text);

    if (!delivered) {
      pushMessage({
        type: "system",
        sender: "system",
        text: "Not connected — message was not delivered.",
        timestamp: Date.now(),
      });
    }
  };

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: PALETTE.bg }}>
      {/* Status bar */}
      <box height={1} paddingX={1} flexDirection="row" backgroundColor={PALETTE.panel}>
        <text fg={PALETTE.text}>{`Chat TUI — ${HANDLE}`}</text>
        <text fg={PALETTE.dim}>{`   ${WS_URL}   `}</text>
        <text fg={STATE_COLOR[connectionState()]}>{`● ${STATE_LABEL[connectionState()]}`}</text>
      </box>

      <Show when={dimensions().height < 12 || dimensions().width < 40}>
        <box height={1} paddingX={1} backgroundColor={PALETTE.error}>
          <text fg="#1a1b26">Terminal window is small — resize for a better view.</text>
        </box>
      </Show>

      {/* Scrollable message history, auto-follows the latest message */}
      <scrollbox
        flexGrow={1}
        stickyScroll
        style={{
          width: "100%",
          flexGrow: 1,
          rootOptions: { backgroundColor: PALETTE.bg },
          wrapperOptions: { backgroundColor: PALETTE.bg },
          viewportOptions: { backgroundColor: PALETTE.bg },
          contentOptions: { backgroundColor: PALETTE.bg, paddingX: 1, paddingY: 0 },
          scrollbarOptions: {
            showArrows: true,
            trackOptions: { foregroundColor: PALETTE.border, backgroundColor: PALETTE.panel },
          },
        }}
      >
        <For each={messages()}>{(message) => <MessageRow message={message} own={message.sender === HANDLE} />}</For>
      </scrollbox>

      {/* Input prompt */}
      <box height={3} border borderColor={PALETTE.border} paddingX={1}>
        <input
          focused
          value={inputValue()}
          placeholder="Type a message and press Enter — Esc or Ctrl+C to quit"
          onInput={setInputValue}
          onSubmit={handleSubmit}
          textColor={PALETTE.text}
          focusedTextColor={PALETTE.text}
          placeholderColor={PALETTE.dim}
          backgroundColor={PALETTE.bg}
          focusedBackgroundColor={PALETTE.bg}
        />
      </box>
    </box>
  );
}
