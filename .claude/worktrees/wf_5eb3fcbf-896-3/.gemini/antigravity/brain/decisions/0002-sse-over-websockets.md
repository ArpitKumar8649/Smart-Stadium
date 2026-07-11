# ADR 0002 — SSE over WebSockets

_Status: Accepted · Date: 2026-07-08_

## Context

Concourse pushes two kinds of realtime events to clients: (a) streaming Gemini tokens during chat, and (b) proactive alerts + incidents from the alerts engine. We need a transport.

Candidates considered:
- **WebSockets** — bidirectional, industry default
- **Server-Sent Events (SSE)** — server → client, HTTP-native, EventSource in browsers
- **Long polling** — legacy fallback
- **Firestore listeners only** — client subscribes directly to Firestore

## Decision

**Server-Sent Events (SSE)** for backend-pushed streams. **Firestore listeners** for crowd + incident data written directly to Firestore.

## Consequences

Positive:
- Azure App Service F1 supports SSE cleanly. WebSocket support on F1 is constrained (single-instance, sometimes flaky through proxies).
- EventSource is native in every browser; no client library required.
- SSE runs over normal HTTP; corporate networks and stadium wifi rarely block it.
- Automatic reconnection is built into `EventSource`.
- We only need server → client. Bidirectionality is not required — chat sends messages via normal `POST /api/chat`, receives SSE stream in the same request.

Negative:
- Text-only, one direction — cannot send binary from client (fine — we send images via `POST /api/vision`, not stream them).
- Long-lived HTTP connections require heartbeats to survive proxies (every 20s).

Non-obvious:
- Combining SSE (backend-pushed alerts) with Firestore listeners (crowd data) means the frontend heatmap keeps updating even if the backend cold-starts on Azure F1. This is a resilience win.
