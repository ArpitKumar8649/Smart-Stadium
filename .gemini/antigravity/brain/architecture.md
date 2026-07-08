# Concourse — Architecture

_How the system fits together. Read this after `project.md`._

## One-line summary

A React PWA (Firebase Hosting) talks to one Node/Express backend (Azure App Service F1) that hosts a Gemini agent with typed tools over a hand-modelled MetLife venue graph, live simulated crowd data (Firestore), and a small RAG corpus.

## Service diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (PWA)                                  │
│  React + Vite + TS + Tailwind + shadcn + Framer Motion + i18next       │
│  ┌─────────────┬──────────────┬──────────┬────────────┬─────────────┐  │
│  │ Concierge   │ Navigation   │ Crowd    │ Accessibility │ Alerts   │  │
│  │ (chat+voice)│ (SVG map+A*) │ (heatmap)│ (a11y+camera) │ (SSE)    │  │
│  └─────────────┴──────────────┴──────────┴────────────┴─────────────┘  │
│  Web Speech API (STT/TTS, no cloud) · react-i18next · Firebase Auth    │
└─────────────┬────────────────────────────────────────────┬─────────────┘
              │ HTTPS/JSON                                 │ SSE
              │ (POST /api/chat, /api/route, ...)          │ (nudges,
              ▼                                            │  incidents)
┌────────────────────────────────────────────────────────────────────────┐
│                       BACKEND (Azure F1)                               │
│  Node 20 + Express + TypeScript + Zod + pino                           │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │  Gemini Agent Loop (one shared backbone)                       │   │
│   │  system prompt → user message → tool calls → response          │   │
│   │  Tools: findRoute · getCrowdLevel · findNearest ·              │   │
│   │         describeImage · ragSearch · getMatchInfo · ...         │   │
│   │  Model: Gemini 2.5 Flash (default) · 2.5 Pro (multimodal)      │   │
│   └────────────────────────────────────────────────────────────────┘   │
│      │            │            │            │                          │
│      ▼            ▼            ▼            ▼                          │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐                 │
│  │Venue   │ │Crowd sim │ │RAG       │ │Alerts engine │                 │
│  │graph   │ │(15s tick)│ │(in-mem)  │ │(rule+LLM)    │                 │
│  │+ A*    │ │→Firestore│ │+embed    │ │→ SSE fan-out │                 │
│  └────────┘ └──────────┘ └──────────┘ └──────────────┘                 │
└─────────────┬─────────────────────┬────────────────────────────────────┘
              │ Admin SDK           │ HTTPS
              ▼                     ▼
┌───────────────────────┐  ┌──────────────────────────────────────────┐
│   Firestore (Spark)   │  │       Google AI Studio (Gemini)          │
│  /crowd/{venue}/{zone}│  │  gemini-2.5-flash · gemini-2.5-pro       │
│  /incidents/{...}     │  │  text-embedding-004                       │
│  /sessions/{sid}      │  │  Free tier: 15 RPM / 1500 RPD (Flash)    │
│  /agg_queries         │  └──────────────────────────────────────────┘
└───────────────────────┘
```

## Layer responsibilities

### Frontend
- **Presentation only.** No business logic.
- Renders whatever the backend or Firestore emits. Never invents route steps, gate numbers, or crowd values.
- Owns UX concerns: i18n string bundles, accessibility modes, voice input/output, camera capture, PWA/offline shell.
- Talks to backend via `/api/*` and to Firestore directly (read-only) for crowd + incidents realtime.

### Backend
- **Single Express app.** Not microservices. Deployed as one Azure App Service F1 instance.
- Hosts the Gemini agent loop — one system prompt, one tool registry, one place to reason about safety and rate limits.
- Owns the venue graph module (loaded once on boot into an in-memory LRU) and the A* routing.
- Runs the crowd simulator as an in-process interval; writes deltas to Firestore.
- Serves SSE streams for alerts and incidents; connections are single-instance-scoped (Azure F1 does not scale out).

### Data
- **Static JSON in the repo** for stable data: venue graph, fixtures, RAG corpus.
- **Firestore** for live data: crowd density per zone, incidents, sessions, aggregated queries.
- **No dedicated database.** No Postgres, no Redis. Everything either lives in memory, Firestore, or JSON.

## Key architectural choices — see `decisions/` for the reasoning

| # | Decision |
|---|----------|
| 0001 | Monorepo with npm workspaces (not Turborepo/pnpm) |
| 0002 | SSE for realtime, not WebSockets |
| 0003 | Gemini via AI Studio only — no Vertex AI, no Cloud Speech, no Cloud Vision, no Cloud Translation |
| 0004 | MetLife Stadium is the flagship venue; graph is hand-modelled |
| 0005 | Crowd is simulated — transparent, not disguised |
| 0006 | Build in Claude Code first, port to Antigravity D10; brain/ is seeded pre-port |
| 0007 | 15 RPM Gemini free-tier ceiling handled with a token-bucket + queue + graceful "one moment" |

## Data flow — a fan asks "where's the nearest step-free restroom?"

1. Client sends POST `/api/chat` with `{ message, sessionId, lang: 'bn' }`.
2. Backend loads system prompt + session context, calls Gemini Flash with function-calling tools registered.
3. Gemini calls `findNearest(userNode: "sec-128", type: "restroom", filters: {step_free: true})`.
4. Backend runs the tool synchronously against the in-memory venue graph, returns candidates ranked by A* distance + crowd penalty.
5. Gemini formats the answer in Bengali and returns it as an SSE-streamed response.
6. Client renders streaming tokens; when a tool call is invoked, an inline chip renders ("checked crowd at L2 north restroom").

## Non-obvious properties

- **The LLM never invents concrete venue facts.** Every gate/section/restroom name in a response must come from a tool result. Enforced in the system prompt and validated in the eval harness.
- **Accessibility is a routing weight, not a filter.** `mode: "step_free"` sets α on step penalties, not a hard exclude — so if step-free is impossible, Concourse still routes and warns.
- **Crowd data updates are Firestore-driven, not backend-pushed.** The frontend subscribes to Firestore listeners directly for the heatmap, so realtime works even if the backend cold-starts.
- **One Gemini backbone.** No per-feature LLM calls. Translation happens inside the concierge's system prompt, not via a separate `translate()` service.

## What is deliberately absent

- No Redis / Postgres / message queue
- No microservices boundary between features
- No WebSockets
- No paid Google Cloud APIs (Vertex, STT, TTS, Vision, Translation are all replaced)
- No native mobile app
- No user profile system beyond Firebase Auth guest state
