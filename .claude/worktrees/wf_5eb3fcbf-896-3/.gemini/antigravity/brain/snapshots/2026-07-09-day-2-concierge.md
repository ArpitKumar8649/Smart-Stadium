# Day 2 snapshot — 2026-07-09

_First working vertical slice: the multilingual concierge, end-to-end._

## Decisions changed today

- **LLM provider: Gemini → Qwen (DashScope, OpenAI-compatible).** Organizers confirmed
  (Zoom session) that the focus is GenAI and *any* AI tool/tech is allowed; Antigravity
  is optional, not mandatory. So we dropped the Gemini-only constraint and the
  build-then-port Antigravity workflow risk (ADR 0006) is largely moot. ADR 0003 is
  superseded on the provider question — see below; a follow-up ADR should record it.
- **No Genkit.** Tested both; the raw `openai` SDK behind a thin `LlmProvider` interface
  keeps the model→tool→model loop explicit and demo-robust. Genkit can slot behind the
  seam later for tracing if we want.

## Verified live (real DashScope calls)

- Basic chat, function-calling, streaming (OpenAI-format SSE), multilingual (Bengali),
  and vision-capable model id all confirmed via curl AND through our own provider code.
- End-to-end `/api/chat`:
  - EN: "nearest step-free restroom from Section 144" → Qwen calls `find_nearest`
    (facility_type=restroom, step_free=true) → A* over the REAL graph → grounded reply
    "Men's Restroom on Plaza Level, ~8.5 min (502m) via step-free, includes one elevator down."
  - BN: "সেকশন ১০৮ থেকে সবচেয়ে কাছের হালাল খাবার" → `find_nearest` (concession) →
    "Global Pies (Level 1, 100 Concourse), 89m, step-free" in fluent Bengali.

## What shipped

Backend:
- `services/llm/provider.ts` — LlmProvider interface (streamChat, chat, describeImage).
- `services/llm/qwen.ts` — QwenProvider over DashScope; streaming tool-call accumulation.
- `services/llm/rate-limit.ts` — token bucket (ADR 0007).
- `services/graph/loader.ts` — loads the 3479-node graph, indexes (byType/byLevel/adjacency),
  findNodeByLabel/searchNodes/nearestNodesByType/haversineMeters.
- `services/graph/astar.ts` — mode-aware A* (fastest/step_free/sensory_safe/low_crowd),
  crowdPenalty hook, RouteResponse with turn-by-turn + warnings.
- `services/agent/tools.ts` — 5 tools (find_route, find_nearest, get_venue_info,
  list_facilities, resolve_place) + handleToolCall; routerGraph() bridges loader→astar shapes.
- `services/agent/prompt.ts` + `data/prompts/concierge.system.md` — persona + tool-grounding law.
- `services/agent/concierge.ts` — the model→tool→model loop (6-hop cap, SSE events).
- `routes/chat.ts` — POST /api/chat SSE endpoint.
- env.ts / logger.ts / .env.example — Qwen vars, DASHSCOPE_API_KEY redaction.

Frontend:
- `features/concierge/useConcierge.ts` — SSE-consuming chat hook (fetch + stream parse).
- `features/concierge/MessageBubble.tsx`, `ToolCallChip.tsx` — streaming bubbles + tool chips.
- `routes/Concierge.tsx` — chat surface, language picker (10 langs), quick suggestions.
- `/concierge` route wired; landing "Try Concourse" links to it. Builds at 57 KB gz.

## Honest follow-ups (not blockers)

1. **`find_nearest` has no dietary filter.** A "halal food" request returns the nearest
   concession, not the nearest *halal* one — even though nodes carry a `halal` flag.
   Add a `dietary` filter to find_nearest (halal/vegetarian) and pass it through to
   nearestNodesByType. Data supports it (e.g. Shah's Halal is flagged).
2. **`astar.test.ts` was not written** — the A* subagent died on a transient API 400 after
   writing astar.ts (complete) but before its test. Add vitest coverage: fastest picks
   stairs, step_free routes via elevator, no-path returns null, step-free warning emitted.
3. **7 NODE_TYPES have zero nodes** (elevator/escalator/ramp/exit/security_check/
   sensory_safe_zone/prayer_room) — these are edges, not nodes, in Mappedin. Tools that
   offer them find nothing; concierge should degrade gracefully (largely does). Consider
   removing them from find_nearest's facility enum, or mapping "elevator" queries to route
   guidance instead.
4. Chat history is not yet persisted per session (each turn is fresh). Wire session context
   + last-N turns in D5.

## D3 next

Crowd simulator + Firestore realtime + the map/heatmap UI, and the navigation feature
(render A* routes on an SVG floor plan). Then decision-support (SSE nudges), accessibility
mode, /admin.
