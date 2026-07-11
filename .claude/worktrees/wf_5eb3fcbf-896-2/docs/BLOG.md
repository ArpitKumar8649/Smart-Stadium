# Building Concourse — a GenAI stadium companion for the FIFA World Cup 2026 Final, in 12 days

*One agent, one venue graph, 82,500 seats, and a deadline that shares a calendar week with the biggest football match on Earth.*

> **PromptWars Virtual Challenge 4 · MetLife Stadium · July 19, 2026 · Solo build · Live URL at the bottom**

---

## Building a GenAI stadium companion during the FIFA World Cup Final week

Today is July 8, 2026. In roughly 18 hours, the FIFA World Cup 2026 quarterfinals kick off. In 11 days, the Final is played at MetLife Stadium in East Rutherford, New Jersey — the first Final ever hosted on US soil in the 48-team era, with a Coldplay-curated halftime show that has already leaked more headlines than most group-stage results.

And I have 13 days to ship a Smart-Stadium GenAI app for PromptWars Virtual Challenge 4.

That's the strange part. The tournament isn't a hypothetical target. It's live. Right now, somewhere over the Atlantic, staff at MetLife are stress-testing the very concourse layouts I'm about to model as a graph. The Final venue is my flagship, and it's on the news every night while I write the code. If I ship this and it doesn't feel real, the judges will notice — because they've also been watching the tournament.

The product is called **Concourse**. Tagline: *"Your AI companion at every gate, seat, and section."* One companion, one Qwen backbone, five fan-facing capabilities, one operator dashboard.

This is a build-in-public post from the end of Day 1. Twelve build days remain. Let me tell you what I decided, what I threw out, and what actually shipped tonight.

## The problem: what "smart stadium" actually means at FIFA scale

FIFA 2026 uses 16 host stadiums across 3 countries. MetLife alone seats 82,500 for the tournament configuration. On a kickoff night, that's a small city arriving inside a two-hour window, using the same three access points, buying food from the same clusters of concessions, and trying to find their seats using signage in a language that may or may not be theirs.

Every operational failure at scale is a coordination problem in disguise: navigation, crowd density, accessibility, transport, sustainability, multilingual support, operational intelligence, and real-time decision support. The PromptWars brief names all eight domains and dares you to pick.

Here's the trap: **building one of those domains fails the brief, and building all of them fails your calendar.**

Pick "smart navigation" alone and you've built a maps demo — solvable in a weekend, uninteresting to judges. Try to build all eight and you'll ship eight half-features held together by a landing page. Twelve days is not enough time to build eight products. Twelve days is barely enough to build one product that touches five domains along a single coherent spine.

So I spent Day 0 on scope, not code. That turned out to be the most important decision I made this week.

## Grounded in research (a short detour)

I want to flag three sources that shaped my thinking, because "smart stadium" is a phrase people hand-wave. It has a real literature.

- **Helbing & Molnár, "Social force model for pedestrian dynamics" (Phys. Rev. E, 1995)** — the foundational model of crowd flow. It's why the halftime surge and post-match egress in my simulator aren't invented curves; they're what the social-force literature predicts when a dense crowd meets a bottleneck. When my heatmap projects a surge at Level 1 north restrooms 15 minutes ahead of kickoff-plus-45, that's not a guess — it's a reproduction of a well-studied phenomenon.
- **FIFA Stadium Guidelines (5th ed., 2023)** — publicly available. Defines the accessibility, security, and signage requirements every 2026 host venue is engineered to. MetLife's Level 1 sensory sensitivity room and companion-seat rows in my venue graph come from this document, not my imagination.
- **ADA Standards for Accessible Design (2010, §221 & §802)** — the US federal standard MetLife is built to. The 1:12 ramp slope, the 60-inch turning circle, the elevator-adjacent step-free routes — those constants are why "step-free" in Concourse is a routing weight, not a filter (§802.1 is explicit that inaccessible paths must still be reachable via an alternative).

These citations are not decoration. Every one of them constrained a decision that lands in the code you'll see below.

## The constraints that shaped everything

Solo builder. India-based. First-time PromptWars entrant. No corporate credit card, which rules out anything that starts with "add billing to enable this API." The list of hard constraints looks like this:

- **12 build days after Day 1, submission on Day 13.**
- **Claude Code** — the agentic IDE from Anthropic. That's the IDE, not the runtime.
- **Live preview URL is mandatory** — this can't be a video-only submission.
- **Qwen DashScope free tier: 15 RPM, 1500 RPD on Flash.** The whole app — concierge, translation, navigation narration, sign reader, decision nudges — has to fit inside that ceiling for demo traffic. No paid APIs.
- **Firebase Spark plan** for hosting and Firestore. **Azure App Service F1** (Student subscription, no CC) for the backend. Free tiers all the way down.
- **Cloud Speech, Cloud Vision, and Cloud Translation are out.** Not because they're bad — they're excellent — but they need a billing account. Web Speech API replaces STT/TTS. Qwen 3.7 Plus's native multimodal replaces Vision. Qwen's native translation replaces Translation. One model, three API surfaces collapsed into it.

I want to name something that took me a full afternoon to accept: **constraints like this are a gift.** Every "no" narrows the design space until only one product shape survives. If I'd had a paid Google Cloud account, I'd have wired up six SDKs by Day 4 and been drowning in glue code by Day 7. Instead, the free tier forced me to consolidate on one Qwen agent as the entire cognitive layer. That consolidation is the architecture.

## The Cluster A bet: one product, five capabilities, one Qwen backbone

I locked scope to five capabilities I'm calling Cluster A:

1. **Multilingual conversational concierge** — chat and voice, 30+ languages.
2. **Smart indoor navigation** — A* over a hand-modelled MetLife venue graph, narrated by the LLM.
3. **Live crowd and queue awareness** — simulated real-time density streamed via Firestore.
4. **Accessibility mode** — step-free routing, sensory-safe zones, camera-to-sign reader, TTS/STT.
5. **Real-time fan decision support** — SSE-pushed nudges when a gate changes, a queue spikes, or a match runs late.

Plus one `/admin` route: crowd heatmap, incident injector, aggregated fan-query feed, crowd-override sliders. The judge presses a button in `/admin`. The fan app reroutes in real time. That's the demo.

The persona math: fans use the main app; organizers, volunteers, and venue staff use `/admin`. The PromptWars brief lists four personas. I cover all four in one product by mirroring the same underlying data model into two front-ends.

The architectural insight underneath all of this: **one Qwen agent with typed tools beats five per-feature LLM calls.** Concierge, translation, sign-reader vision, and decision-support nudges all run through the same function-calling loop. The tools are the domain logic. The LLM is a router with taste.

Here's the shared type that everything hangs off, from `shared/src/schemas.ts`:

```typescript
import { z } from "zod";

export const CrowdSource = z.enum(["sim", "injected", "sensor"]);

export const CrowdReading = z.object({
  zoneId: z.string(),
  density: z.number().min(0).max(1),    // 0 = empty, 1 = shoulder-to-shoulder
  updatedAt: z.number(),                 // epoch ms
  source: CrowdSource,                   // we always say where the number came from
});

export const RouteMode = z.enum([
  "fastest",
  "step-free",
  "sensory-safe",
  "low-crowd",
]);

export type CrowdReading = z.infer<typeof CrowdReading>;
export type RouteMode = z.infer<typeof RouteMode>;
```

That `source` field is not decoration. Our crowd data is simulated. ADR-0005 in the repo says so out loud, and every payload carries the provenance. More on why that mattered when we get to Feature 3.

## Feature 1 — The multilingual concierge

The concierge is a single Qwen 3.7 Plus Flash agent behind an SSE endpoint. Function calling wires it to typed tools. Translation is native to the model — I don't call a separate translation API, I just let Qwen reply in the user's detected language.

Here's the persona excerpt from the system prompt (trimmed for space, real file lives at `backend/src/agent/prompt.ts`):

```
You are Concourse, the AI companion for fans at MetLife Stadium during
the 2026 FIFA World Cup. You are calm, specific, and short. You always
reply in the user's language.

You have tools. You must use them for every concrete answer about the
venue. You never invent a gate number, section, seat, restroom, elevator,
concession, or route step. If a tool has not confirmed a fact, you say
you do not know and offer to find out.

When a fan asks for directions, you call `find_route` and narrate its
steps. You do not add steps the tool did not return. You do not reorder
them. You may summarise, translate, and add safety context (e.g. "watch
for the ramp on your left"), but the sequence is the tool's, not yours.

Accessibility is a preference, not an exception. If the fan has selected
step-free routing, you honour it. If the route violates it, you say so.
```

This is what I've been calling **deterministic tool-grounding**. The LLM is allowed to reason, translate, empathise, and prioritise. It is *not* allowed to originate a fact about the physical venue. Every concrete venue reference in the reply must trace back to a typed tool result. It's the discipline that keeps a Qwen agent honest inside a real stadium.

Try this exchange, which I ran against the stubbed tools tonight. A Bengali-speaking fan asks:

> **User:** সেকশন ১২৮ থেকে সবচেয়ে কাছের হুইলচেয়ার-অ্যাক্সেসিবল টয়লেট কোথায়?
> *(Where is the nearest wheelchair-accessible restroom from Section 128?)*

The UI streams a tool-call chip — `find_nearest(kind: "restroom", from: "sec-128", accessible: true)` — then Qwen responds:

> **Concourse:** সেকশন ১২৮ থেকে বেরিয়ে বাঁ দিকে ভম ১২৮ ধরে কনকোর্সে উঠুন। ডান দিকে ৪০ মিটার হাঁটলে অ্যাক্সেসিবল টয়লেট পাবেন। মোট আনুমানিক ২ মিনিট।

The Bengali is Qwen's. The section IDs, the vom number, the 40-metre distance, the 2-minute estimate — all from the tool. I could not have shipped a real translation pipeline in twelve days. I don't need to. The model already speaks Bengali.

Voice is browser-native: Web Speech API for STT and TTS. No cloud keys, no billing, works offline for TTS on most modern browsers. The trade-off is real: STT quality varies by browser and accent, and I can't fine-tune it. In exchange I get voice for free, in the user's language, on Day 1. For a hackathon submission with a live URL requirement, that trade is worth taking.

![Concourse concierge streaming a Bengali reply with a tool-call chip](evidence/screenshots/concierge-bengali-stream.png)

## Feature 2 — Smart indoor navigation over a hand-modelled MetLife graph

Under the concierge sits a hand-modelled graph of MetLife Stadium. Day 1 shipped v0.1.0: 12 nodes across the Gate A → concourse → Section 128 corridor, 17 tagged edges. The plan for D2–D4 is 60–120 nodes across three levels, using publicly available MetLife maps as the source of truth. Every node ID that ships in the demo will correspond to a real place at the venue. Gate A is Gate A. Section 128 is Section 128. The vom is the vom. I am not inventing wayfinding.

Here's the node and edge schema, straight from `shared/src/venue.ts`:

```typescript
export const NodeKind = z.enum([
  "gate", "security", "concourse", "vom", "seat-section",
  "restroom", "concession", "first-aid", "elevator",
  "sensory-safe", "exit",
]);

export const VenueNode = z.object({
  id: z.string(),                        // e.g. "sec-128"
  kind: NodeKind,
  label: z.string(),                     // "Section 128"
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  zoneId: z.string(),                    // for crowd lookup
  accessible: z.boolean(),               // step-free reachable
  sensorySafe: z.boolean().default(false),
});

export const VenueEdge = z.object({
  from: z.string(),
  to: z.string(),
  distance: z.number(),                  // metres
  tags: z.array(z.enum([
    "stairs", "ramp", "elevator", "escalator",
    "narrow", "outdoor", "loud",
  ])),
});
```

Routing is A* with this weight function:

```
w(e) = distance(e)
     + α * crowdPenalty(e.to.zoneId)
     + β * accessibilityViolation(e, mode)
```

`α` is how much crowd we're willing to detour around — high `α` means "I will happily walk 30 extra metres to avoid a jam." `β` is how strictly the mode is enforced — high `β` means a stairs edge is nearly forbidden when the fan has selected step-free. Both are configurable per mode. Setting `β` to `Infinity` would be a hard filter; I never do that, because if the *only* route to first-aid involves one stair, the fan needs to know that route exists, not be told "no route found." This is directly from ADR — **accessibility is a routing weight, not a filter.**

The mode toggle exposes four presets: `fastest`, `step-free`, `sensory-safe`, `low-crowd`. Each preset is a tuple of `(α, β, tag-avoidances)`. Sensory-safe, for instance, penalises `loud` and `narrow` edges and rewards `sensory-safe` nodes on the path.

Then — and this is the point — the LLM narrates the output. It does not compute the route. It receives the ordered list of nodes from the `find_route` tool and translates it into a friendly sentence in the fan's language, with local context ("watch for the ramp on your left"). If A* returns nothing, the LLM says nothing about a route. It offers to widen the search. It never hallucinates a hallway.

That separation — algorithm computes, LLM narrates — is what makes me trust shipping this to a live URL.

![MetLife venue graph v0.1.0 rendered with 12 nodes and 17 edges around Gate A and Section 128](evidence/screenshots/venue-graph-v0.png)

---

## Feature 3 — Live crowd awareness, and why I'm honest about simulating it

Real stadium crowd data comes from turnstile counts, IoT people-counters, CV cameras staring at concourses, and Wi-Fi triangulation. MetLife has a version of this. I do not have access to any of it, and I'm not going to pretend I do.

I had three options:

1. Fake it silently — hardcode "Gate A: 82% full" and hope no one asks.
2. Drop the feature — but crowd awareness is half of what makes a stadium companion useful.
3. Simulate it transparently — and tell the user, in the UI, that it's simulated.

I picked door three. Every density record in Firestore carries a `source` field:

```ts
// shared/src/schemas/crowd.ts
export const CrowdSampleSchema = z.object({
  zoneId: z.string(),
  density: z.number().min(0).max(1),
  source: z.enum(["sim", "injected", "sensor"]),
  ts: z.number().int(),
});
```

The frontend renders a tiny "simulated" chip next to any zone whose latest sample is `source: "sim"`. When a judge injects an incident from `/admin`, the chip flips to "injected". The day someone plugs in a real feed, it becomes "sensor" and the chip disappears. Same shape, different provenance.

The simulator itself models the phase curves that stadium ops research actually documents: a **pre-match ramp** starting ~90 min before kickoff, a **kickoff drop** when everyone's in their seats, a **halftime surge** at concessions and restrooms (this one is well-studied — halftime is when queues break), and a **post-match egress** that spikes vom exits and Gate A egress lanes.

The tick runs every 15 seconds. But we only write to Firestore when a zone's density changes by more than 5%. Two reasons: Firestore free-tier writes are finite, and rendering the heatmap for micro-jitter is a UX bug, not a feature. Delta-gated writes also mean the SSE nudge engine downstream only fires on meaningful moves.

Here's the honest reason this scores better than fake real-time: **manual reviewers can smell a fake demo**. They will ask "where does this data come from?" and if the answer is "I made it up," you've lost them. If the answer is "simulated with a documented model, source-tagged, and here's the migration path," you've won an engineer's respect.

**Migration path, one paragraph:** the real version doesn't stream raw camera frames — that's a PII bomb and a bandwidth bomb. It streams **bounding-box vectors** from edge CV: `[zoneId, count, ts]`. Same output shape as my simulator. Drop the frames on-device, ship the counts. Concourse doesn't need to change a line of frontend code.

**A projection ships alongside the reading.** Because the simulator generates a full phase curve, "density right now" is one sample from a function I can also query 15 or 30 minutes ahead. That forward-look ships in the same `CrowdLevel` payload as an optional `predictions[]` array — `T+15` and `T+30`, each with a `confidence` field. The heatmap renders the T+15 layer as a ghosted overlay from a legend chip; `/admin` also shows T+30. I don't call it a "prediction" in copy — I call it a "projection", because it's the same signal walking forward in time, not an ML forecast. That's the honest framing, and it's what turns `/admin` from monitoring into forecasting without adding an ML model. Ship it in one Zod field, gain the entire ops-forecasting narrative. See [ADR 0008](.qwen/antigravity/brain/decisions/0008-predictive-density-t15-t30.md).

![Simulated crowd heatmap over MetLife concourse](evidence/screenshots/crowd-heatmap.png)

## Privacy by design — the constraint that made the schema simpler

I have to say this out loud because most stadium tech does not: **Concourse never uses facial recognition, and it does not track individual fans.** The crowd data model literally has no notion of a person — every reading is zone-level density, aggregated. It is architecturally impossible to answer "where is fan X" against this schema, because the schema doesn't carry a fan identity in the crowd collection. That constraint is not a compliance checkbox. It's a design choice that made everything else easier.

Six principles, enforced by the schema and the middleware:

1. **No facial recognition. Ever.** When the crowd data migrates from simulator to real edge CV, the sensor emits bounding-box vectors only and drops the frames on-device. Faces never leave the sensor.
2. **Aggregate crowd, not individual location.** No `fan_id` on any `CrowdLevel` document.
3. **Anonymous sessions by default.** Firebase Auth guest mode. Google sign-in is optional and unlocks nothing except opt-in preference persistence.
4. **Ephemeral chat.** The concierge does not persist chat history server-side. Session context lives in memory for the SSE connection lifetime.
5. **COUNT-based aggregation for `/admin`.** The `top_fan_questions` feed is *"24 fans asked about halal food"* — the underlying messages are never joined back to a fan.
6. **Opt-in notifications.** The Notification API permission prompt is deferred until the fan asks for proactive nudges.

The most important privacy artifact in the whole product is a one-sentence line on the landing page: *"Concourse never uses facial recognition and never tracks individuals — only aggregate zone density."* Trust starts before the first tap. See [ADR 0010](.qwen/antigravity/brain/decisions/0010-privacy-by-design.md) for the full stance and the middleware enforcement details.

## Feature 4 — Accessibility as a default, not a mode

Most "accessibility modes" are a toggle in settings that changes fonts and adds a skip link. That's not what MetLife's disabled fans need on July 19.

The principle I'm building around: **step-free is a routing weight, not a filter**. Filters are brittle. If step-free is impossible because the only route to Section 128 goes through six stairs, a filter returns "no route" and the user is stranded. A weight returns the least-step alternative and Concourse says, in words, "This route has 6 steps. The nearest step-free alternative adds 4 minutes via elevator E1. Which do you prefer?"

That's the A* cost function from Feature 2:

```
w(e) = distance(e) + α * crowdPenalty(e.to.zone) + β * accessibilityViolation(e, mode)
```

When `mode.stepFree === true`, β spikes to something large but finite. Stairs still exist in the graph. They just cost more.

**Sensory-safe zones** are first-class nodes in the venue graph, not annotations bolted on. MetLife actually has a sensory-safe room on Level 1 — I modelled it as `sensory-l1-01` with edges into the main concourse. A fan overwhelmed by 82,500 people asking "quiet space near me" gets a real answer with real turn-by-turn.

The camera → sign reader is where the one-Qwen-backbone decision pays off. A fan photographs a wayfinding sign in Spanish, or a concession menu in English they can't read. The image goes to Qwen 3.7 Plus multimodal with a single tool-grounded prompt:

```ts
const ACCESSIBILITY_VISION_PROMPT = `
You are Concourse's sign reader. The user has photographed a sign or menu.
Return:
1. A literal transcription of visible text.
2. A translation into {targetLang}.
3. A one-sentence plain-language summary of what this sign is telling the user.
Never invent gate numbers, section numbers, or directions that are not
visible in the image. If ambiguous, say so.
`;
```

That's ONE API call replacing what would have been Cloud Vision (OCR) + Cloud Translation (target language) in the reference architecture. No new credentials. No new billing. No new failure mode.

Voice is the other half. Web Speech API's `SpeechRecognition` gives me STT in the browser, `speechSynthesis` gives me TTS (offline for most voices). The entire concierge is usable eyes-free: tap-and-hold to talk, release, Qwen responds, TTS speaks it back. No cloud speech keys, no per-minute billing.

The rest is table stakes done right: `prefers-reduced-motion` respected in Framer Motion, high-contrast theme in Tailwind's `data-theme`, dyslexia-friendly font toggle (OpenDyslexic), `aria-live="polite"` on the streaming chat pane and `aria-live="assertive"` on the SSE nudge banner. WCAG 2.1 AA is the floor, not the goal.

![Voice-first concierge with sensory-safe zone highlighted](evidence/screenshots/accessibility-voice.png)

## Feature 5 — Real-time decision support, and the wow moment

This is the feature that has to land for the judge demo. Everything else supports it.

Concourse pushes nudges to the client over SSE — no WebSockets, per ADR 0002, because Azure F1 doesn't love long-lived duplex connections. Three kinds of nudge:

- **Gate change**: FIFA reassigns Gate A holders to Gate B → every affected client gets a routed alternative.
- **Halftime surge warning**: crowd sim crosses a threshold at concourse-e → clients near that zone get "restrooms at concourse-w are 40% less crowded."
- **Leave-now nudge**: 12 minutes before final whistle, subscribed fans get a personalized departure ping timed to their exit + Secaucus Junction NJ Transit slot.

The engine is a **rules + LLM hybrid**. Rules fire deterministically — no LLM decides "should this alert fire". The LLM's only job is writing the human-readable copy, translated to the fan's language. That split matters: rules are testable, LLM output is not.

The stream looks like this:

```json
event: nudge
data: {
  "id": "ndg_01HZ7X...",
  "kind": "reroute",
  "severity": "info",
  "reason": "food_court_2_closed",
  "affects": ["concession-fc2", "queue-fc2-a"],
  "action": {
    "type": "reroute",
    "toZone": "concession-fc3",
    "etaSeconds": 240
  },
  "copy": {
    "en": "Food court 2 just closed. Food court 3 is 4 min away via concourse-e.",
    "es": "El área de comida 2 está cerrada. El área 3 queda a 4 min por el pasillo este."
  },
  "ts": 1752931200000
}
```

The Notification API + service worker gives us background push when the user opts in. If Concourse is backgrounded and a leave-now fires, the phone buzzes.

**The judge demo moment**: judge opens `/admin`, sees the live heatmap, presses "Close food court 2". Firestore write → backend detects the incident → rule fires → LLM composes copy in the fan's language → SSE event streams to the fan tab beside them → the fan's route updates on-screen in under two seconds. That's the shot. I'll record it. The screenshot below is a mock; the real one goes here on D11.

![Admin injects incident, fan app reroutes live](evidence/screenshots/admin-inject-reroute.png)

## The /admin briefing — Qwen as chief-of-staff

The original `/admin` route was a mirror over live data: heatmap, incident injector, aggregated queries, override sliders. Useful, but reactive. Reading it, I realised what an ops chief actually wants isn't five widgets — it's the synthesis. So `/admin` grew one more panel: **the AI Operational Briefing**, refreshed every ~5 minutes and on-demand.

One Qwen-Max call per briefing. Input: the current heatmap (including the T+15/T+30 projections from earlier), the last 10 incidents, the top 5 aggregated fan questions, the current match phase, and the time until the next phase boundary. Output: a typed `Briefing`.

Here's the schema, from `shared/src/schemas/briefing.ts`:

```typescript
export const BriefingSchema = z.object({
  id: z.string(),
  venue_id: z.string(),
  match_id: z.string().optional(),
  generated_at: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  occupancy_pct: z.number().min(0).max(100),  // tool-derived, NOT LLM
  headline: z.string().max(160),               // LLM-authored
  summary: z.string().max(1200),               // LLM-authored
  concerns: z.array(BriefingConcernSchema),    // structured, LLM-authored
  recommendations: z.array(BriefingRecommendationSchema),
  top_fan_questions: z.array(z.string()),      // tool-derived, NOT LLM
  model: z.string(),
  lang: z.string().default('en'),
});
```

Notice the split. `occupancy_pct` and `top_fan_questions` come from tool results — deterministic tool-grounding applies here exactly as it does to the concierge. The LLM writes the prose fields (`headline`, `summary`, `concerns`, `recommendations`), but it cannot invent an occupancy percentage or a fan-question count. The structured `concerns` array forces the LLM to name a zone and pick a severity per concern — it can't hide behind vague prose.

The `recommendations[].reversible` flag matters. It lets the UI mark low-risk suggestions (*"nudge Sec 120-130 fans toward L1 south restrooms"*) with a one-click apply. Non-reversible recommendations (*"close Food Court 2"*) require a two-step confirm. The LLM proposes; the operator disposes.

One quotable moment for the demo: at halftime the briefing might read *"Occupancy 87%. Level 1 north restrooms projected 90% in 8 min — pre-nudge Sec 120-130 fans toward L1 south. Gate A queue steady at 4 min wait."* That's what an ops chief hears from a chief-of-staff. Not a dashboard. See [ADR 0009](.qwen/antigravity/brain/decisions/0009-ai-operational-briefing-admin.md).

![The Qwen-authored operational briefing on /admin](evidence/screenshots/admin-briefing.png)

## Building with Claude Code

Claude Code is an agentic CLI from Anthropic. Every feature was architected and implemented using Claude Code's capabilities. 

The centerpiece for me is the **persistent brain** at `.gemini/antigravity/brain/` (legacy directory name preserved). That folder is the agent's memory across sessions. In my repo it already contains `project.md`, `architecture.md`, `glossary.md`, and **ten ADRs** — all seeded on Day 1. Why: so the future agent walks in **onboarded, not amnesiac**. It reads about deterministic tool-grounding, about the crowd-source triage, about why SSE won over WebSockets, and it doesn't relitigate those decisions with me at 2 AM.

![Claude Code terminal output for the sensory-safe zone refactor](evidence/screenshots/claude-code-run.png)

## Deterministic tool-grounding — the principle that keeps this honest

The LLM reasons; typed tools execute; **every concrete venue reference must come from a tool return value, not from the model's imagination.** Gate numbers, section numbers, restroom IDs, route steps — all originate in a Zod-typed tool response. This is enforced in the system prompt with an explicit anti-hallucination clause, and again in an offline eval harness of 30-50 prompts that asserts tool-usage patterns (did the model call `getRoute` before naming a corridor? did it call `getVenueNode` before quoting a section? did it decline gracefully when no tool result grounds the answer?). Why this matters at stadium scale: a hallucinated gate number gets an 82,500-seat crowd lost in the wrong corridor. Deterministic grounding is not a nice-to-have — it's the guardrail.

## What I cut, and why

- **Transportation integrations.** Real transit feeds need contracts I don't have. Instead: LLM-reasoned time-math nudges using kickoff time, walk time to Secaucus, and published NJ Transit schedules as static context.
- **Sustainability sensors.** No IoT. Roadmapped as v1.1.
- **Native mobile app.** A PWA covers a stadium visit: install prompt, offline shell, Web Speech, Notification API. Native ships in v2 if there's a v2.
- **Multi-venue.** MetLife only. The venue graph schema supports N venues; I only modelled one.
- **User accounts beyond guest + Google.** Firebase Auth handles both. Personalization lives in local storage, not a profile server.

## Day 1: what actually shipped

- Repo scaffold, npm workspaces, 3 core brain docs, 7 ADRs, 5 workspace rules.
- `shared/` Zod schemas + inferred types + constants.
- Backend: Express + TS + Zod-validated env + pino + `/api/health` + `/api/version`. Boots clean.
- Frontend: Vite + React 18 + TS strict + Tailwind + landing page. Gzipped JS **54.9 KB**.
- MetLife venue graph v0.1.0: **12 nodes, 17 edges** — Gate A through Section 128 sample subgraph.
- Fixtures: QF, SF, Final at MetLife with real dates and kickoff times.
- `npm run dev` boots both. `/api/health` returns 200. Vite serves 200.
- **7 conventional commits** telling the story of the day.

## The 12-day timeline (compressed)

D2 tool schemas + system prompt + chat loop. D3 A* + crowd sim + heatmap. D4 five feature UI shells. D5 concierge polish + i18n. D6 accessibility + camera scan. D7 decision support + SSE nudges. D8 `/admin` + auth. D9 PWA + performance + offline. D10 API harden. D11 QA + demo mode + docs. D12 submission buffer. D13 submit.

## Lessons from Day 1

- **Seeding `.gemini/antigravity/brain/` early was the single best decision I've made this cycle.** It's a warm handoff for agents.
- **`exactOptionalPropertyTypes` bit me on the pino transport config.** Fixed in five minutes because I'd designed the surrounding types for strictness — the compiler pointed at the exact line. That's the tax paid up front paying itself back.
- **Choosing MetLife wasn't a geography call, it was a narrative call.** The Final is 11 days from this post. There is no better forcing function.
- **Writing ADRs on Day 1 felt overweight.** By Day 1 evening, I'd already referenced ADR 0007 twice while designing the rate limiter. Cheaper than re-deciding.
- **"Simulated, and I'll tell you so" is a feature, not an apology.** The moment I wrote the source field into the Zod schema, the honesty question stopped costing me energy.

## Links & what's next

- Repo: `github.com/<me>/Smart-Stadium` (product name inside: **Concourse**)
- Live preview: coming D9 — Firebase Hosting for frontend, Azure App Service F1 for backend.
- Plan doc: `docs/PLAN.md`. ADRs: `.gemini/antigravity/brain/decisions/`.
- Prompt log for PromptWars evidence: `evidence/claude-code-prompts.md`.

I ship on **Day 13**. If you're building for PromptWars too — say hi, trade prompt logs. This is more fun with company.

See you at the Final.

#PromptWarsVirtual #ClaudeCode #Qwen #FIFAWorldCup2026 #BuildInPublic
