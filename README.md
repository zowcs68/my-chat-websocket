# Chat TUI

A production-grade terminal chat client built with **Bun**, **TypeScript**, **[@opentui/solid](https://github.com/sst/opentui)**, and native **WebSockets**.

```
┌─────────────────────────────────────────────────────────────┐
│ Chat TUI — guest-a1b2    ws://localhost:8080   ● Connected   │
├─────────────────────────────────────────────────────────────┤
│ [12:00:01] * Connected as guest-a1b2                         │
│ [12:00:04] alice: hey, anyone around?                        │
│ [12:00:07] guest-a1b2: yep, just joined                      │
│ [12:00:09] * Connection lost, reconnecting…                  │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ > Type a message and press Enter — Esc or Ctrl+C to quit     │
└─────────────────────────────────────────────────────────────┘
```

## Features

- Scrollable message history with per-message timestamps, sender handles, and
  distinct coloring for your own messages, other users, and system events.
- A pinned input prompt at the bottom of the screen.
- A live status bar showing `Connecting… / Connected / Reconnecting… / Disconnected`.
- A persistent WebSocket connection with automatic reconnection using
  exponential backoff (500ms → 1s → 2s → … capped at 15s).
- Reactive UI powered by SolidJS signals — no manual re-render calls anywhere.
- `Enter` sends a message, `Esc` or `Ctrl+C` exits cleanly (socket is closed
  and the terminal is restored).
- Auto-scrolls to the newest message (`stickyScroll` on the scrollbox).
- Resize-safe layout: everything is expressed as flex/percentage sizing, and a
  small-terminal warning appears if the window gets too cramped.
- A minimal reference Bun WebSocket server included so you can try the client
  immediately without standing up your own backend.

## Requirements

- [Bun](https://bun.sh) v1.1 or later.

## Setup

```bash
# 1. Install dependencies
bun install

# 2. In one terminal: start the reference chat server
bun run server

# 3. In another terminal (or several, to simulate multiple users):
bun run dev
```

`bun run dev` and `bun run server` are just aliases defined in `package.json`
for `bun run src/client/index.tsx` and `bun run src/server/server.ts`.

Open several terminal windows running `bun run dev` to see messages broadcast
between "users" in real time.

## Configuration

Both the client and the reference server are configured via environment
variables, so you can point the client at any WebSocket endpoint:

| Variable        | Applies to | Default                | Description                          |
|------------------|-----------|-------------------------|---------------------------------------|
| `CHAT_WS_URL`    | client    | `ws://localhost:8080`   | WebSocket endpoint to connect to      |
| `CHAT_HANDLE`    | client    | `guest-xxxx` (random)   | Display name shown next to your messages |
| `CHAT_PORT`      | server    | `8080`                  | Port the reference server listens on  |

Example — connect to a remote server with a custom handle:

```bash
CHAT_WS_URL=wss://chat.example.com CHAT_HANDLE=alice bun run dev
```

## Project Structure

```
chat-tui/
├── bunfig.toml               # Registers the required @opentui/solid preload hook
├── package.json
├── tsconfig.json              # JSX configured for the @opentui/solid JSX runtime
└── src/
    ├── shared/
    │   └── types.ts            # Wire-format ChatMessage contract shared by client & server
    ├── client/
    │   ├── index.tsx            # Entry point — mounts the Solid app via `render()`
    │   ├── App.tsx               # Chat UI: status bar, scrollback, input prompt
    │   └── chat-socket.ts        # WebSocket wrapper: state machine + backoff reconnect
    └── server/
        └── server.ts              # Reference Bun.serve WebSocket broadcast server
```

## How the pieces fit together

### `ChatSocket` (`src/client/chat-socket.ts`)

A small class built on top of the **native `WebSocket`** global that Bun
provides (no `ws` package dependency needed) that:

- Emits a `"state"` event any time the connection moves between
  `connecting`, `open`, `reconnecting`, and `closed`.
- Emits a `"message"` event with a parsed `ChatMessage` for every inbound
  frame (falls back to wrapping raw text as a `system` message if the payload
  isn't valid JSON).
- Reconnects automatically after an unexpected close, waiting
  `min(base * 2^attempt, max)` milliseconds between attempts — this is the
  exponential backoff. A manual `.close()` (e.g. on quit) disables further
  reconnect attempts.

### `App` (`src/client/App.tsx`)

Built with `@opentui/solid`'s intrinsic JSX elements (`box`, `text`,
`scrollbox`, `input`, `span`). State is plain Solid signals
(`createSignal`) for messages, connection state, and the input's current
value — the UI re-renders automatically whenever those signals change, no
manual repaint calls.

- `useKeyboard` is used to catch `Esc` and cleanly shut the socket and
  process down (`Ctrl+C` is handled for free via the renderer's
  `exitOnCtrlC` option).
- `useTerminalDimensions` drives a "terminal is too small" banner, and every
  layout dimension is percentage/flex based so resizing the terminal
  reflows the UI instead of crashing it.
- `stickyScroll` on the `<scrollbox>` keeps the view pinned to the latest
  message as new ones arrive.

### `server.ts` (`src/server/server.ts`)

A ~50-line `Bun.serve` WebSocket server used purely so you have something to
connect the client to out of the box. It broadcasts every incoming chat
message, plus join/leave system notices, to all connected clients via Bun's
built-in pub/sub (`ws.subscribe` / `server.publish`). Swap this out for your
own backend by pointing `CHAT_WS_URL` at it — the client only relies on the
shared `ChatMessage` JSON shape in `src/shared/types.ts`.

## Building a standalone binary (optional)

Since `@opentui/solid` uses JSX that needs Babel transformation, use the
provided Solid bun plugin when compiling to a single executable:

```ts
// build.ts
import solidPlugin from "@opentui/solid/bun-plugin";

await Bun.build({
  entrypoints: ["./src/client/index.tsx"],
  target: "bun",
  plugins: [solidPlugin],
  compile: { outfile: "chat-tui" },
});
```

```bash
bun run build.ts
./chat-tui
```
