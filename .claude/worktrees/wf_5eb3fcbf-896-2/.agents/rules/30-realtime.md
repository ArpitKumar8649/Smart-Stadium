# Rule 30 — Realtime conventions

_Applied to SSE endpoints and Firestore listeners._

## SSE endpoint shape

- Path convention: `/api/<resource>/stream`
- Content-Type: `text/event-stream`
- Every event has a `type` field so the client can dispatch: `type: "token" | "toolCall" | "toolResult" | "done" | "error" | "heartbeat"`
- Heartbeat every 20 seconds to keep proxies from closing the connection
- Client uses native `EventSource` (no polyfill needed — modern browsers only)

## Reconnection

- Client-side EventSource auto-reconnects on drop; do not fight it
- Server does not maintain per-client state across reconnects — every stream is fresh
- Alerts stream re-sends the last 10 alerts on connect so a reconnecting client is not blind

## Firestore listeners

- Client subscribes directly to `/crowd/{venueId}/{zoneId}` documents; no backend proxy
- Firestore security rules allow read on `/crowd/*` and `/incidents/*` to signed-in users (guest auth counts)
- Backend is the only writer for these collections — clients cannot mutate

## Rate limits on realtime

- Crowd simulator writes at most every 15 seconds per zone
- Alert engine emits at most one nudge per session per 30 seconds
- SSE streams throttle heartbeats to one per 20 seconds

## Data envelope for streamed tokens (chat)

```json
{"type": "token", "text": "Gate ", "index": 0}
{"type": "toolCall", "name": "findNearest", "args": {"type": "restroom"}}
{"type": "toolResult", "name": "findNearest", "ok": true}
{"type": "token", "text": "C is closest — 8 min walk.", "index": 5}
{"type": "done", "usage": {"inputTokens": 412, "outputTokens": 38}}
```

## No WebSockets

- If someone (or an agent) reaches for WebSockets, redirect to SSE (see ADR 0002)
