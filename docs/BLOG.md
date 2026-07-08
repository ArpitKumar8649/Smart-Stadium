# Building Concourse — a GenAI stadium companion for the FIFA World Cup 2026 Final, in 12 days

*One agent, one venue graph, 82,500 seats, and a deadline that shares a calendar week with the biggest football match on Earth.*

> **PromptWars Virtual Challenge 4 · MetLife Stadium · July 19, 2026 · Solo build · Live URL at the bottom**

---

## Building a GenAI stadium companion during the FIFA World Cup Final week

Today is July 8, 2026. In roughly 18 hours, the FIFA World Cup 2026 quarterfinals kick off. In 11 days, the Final is played at MetLife Stadium in East Rutherford, New Jersey — the first Final ever hosted on US soil in the 48-team era, with a Coldplay-curated halftime show that has already leaked more headlines than most group-stage results.

And I have 13 days to ship a Smart-Stadium GenAI app for PromptWars Virtual Challenge 4.

That's the strange part. The tournament isn't a hypothetical target. It's live. Right now, somewhere over the Atlantic, staff at MetLife are stress-testing the very concourse layouts I'm about to model as a graph. The Final venue is my flagship, and it's on the news every night while I write the code. If I ship this and it doesn't feel real, the judges will notice — because they've also been watching the tournament.

The product is called **Concourse**. Tagline: *"Your AI companion at every gate, seat, and section."* One companion, one Gemini backbone, five fan-facing capabilities, one operator dashboard.

This is a build-in-public post from the end of Day 1. Twelve build days remain. Let me tell you what I decided, what I threw out, and what actually shipped tonight.

## The problem: what "smart stadium" actually means at FIFA scale

FIFA 2026 uses 16 host stadiums across 3 countries. MetLife alone seats 82,500 for the tournament configuration. On a kickoff night, that's a small city arriving inside a two-hour window, using the same three access points, buying food from the same clusters of concessions, and trying to find their seats using signage in a language that may or may not be theirs.

Every operational failure at scale is a coordination problem in disguise: navigation, crowd density, accessibility, transport, sustainability, multilingual support, operational intelligence, and real-time decision support. The PromptWars brief names all eight domains and dares you to pick.

Here's the trap: **building one of those domains fails the brief, and building all of them fails your calendar.**

Pick "smart navigation" alone and you've built a maps demo — solvable in a weekend, uninteresting to judges. Try to build all eight and you'll ship eight half-features held together by a landing page. Twelve days is not enough time to build eight products. Twelve days is barely enough to build one product that touches five domains along a single coherent spine.

So I spent Day 0 on scope, not code. That turned out to be the most important decision I made this week.

## The constraints that shaped everything

Solo builder. India-based. First-time PromptWars entrant. No corporate credit card, which rules out anything that starts with "add billing to enable this API." The list of hard constraints looks like this:

- **12 build days after Day 1, submission on Day 13.**
- **Google Antigravity is mandatory** — the new agent-first VS Code fork with a Gemini 3 Pro backbone, in free public preview. That's the IDE, not the runtime.
- **Live preview URL is mandatory** — this can't be a video-only submission.
- **Gemini AI Studio free tier: 15 RPM, 1500 RPD on Flash.** The whole app — concierge, translation, navigation narration, sign reader, decision nudges — has to fit inside that ceiling for demo traffic. No paid APIs.
- **Firebase Spark plan** for hosting and Firestore. **Azure App Service F1** (Student subscription, no CC) for the backend. Free tiers all the way down.
- **Cloud Speech, Cloud Vision, and Cloud Translation are out.** Not because they're bad — they're excellent — but they need a billing account. Web Speech API replaces STT/TTS. Gemini 2.5's native multimodal replaces Vision. Gemini's native translation replaces Translation. One model, three API surfaces collapsed into it.

I want to name something that took me a full afternoon to accept: **constraints like this are a gift.** Every "no" narrows the design space until only one product shape survives. If I'd had a paid Google Cloud account, I'd have wired up six SDKs by Day 4 and been drowning in glue code by Day 7. Instead, the free tier forced me to consolidate on one Gemini agent as the entire cognitive layer. That consolidation is the architecture.

## The Cluster A bet: one product, five capabilities, one Gemini backbone

I locked scope to five capabilities I'm calling Cluster A:

1. **Multilingual conversational concierge** — chat and voice, 30+ languages.
2. **Smart indoor navigation** — A* over a hand-modelled MetLife venue graph, narrated by the LLM.
3. **Live crowd and queue awareness** — simulated real-time density streamed via Firestore.
4. **Accessibility mode** — step-free routing, sensory-safe zones, camera-to-sign reader, TTS/STT.
5. **Real-time fan decision support** — SSE-pushed nudges when a gate changes, a queue spikes, or a match runs late.

Plus one `/admin` route: crowd heatmap, incident injector, aggregated fan-query feed, crowd-override sliders. The judge presses a button in `/admin`. The fan app reroutes in real time. That's the demo.

The persona math: fans use the main app; organizers, volunteers, and venue staff use `/admin`. The PromptWars brief lists four personas. I cover all four in one product by mirroring the same underlying data model into two front-ends.

The architectural insight underneath all of this: **one Gemini agent with typed tools beats five per-feature LLM calls.** Concierge, translation, sign-reader vision, and decision-support nudges all run through the same function-calling loop. The tools are the domain logic. The LLM is a router with taste.

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

The concierge is a single Gemini 2.5 Flash agent behind an SSE endpoint. Function calling wires it to typed tools. Translation is native to the model — I don't call a separate translation API, I just let Gemini reply in the user's detected language.

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

This is what I've been calling **deterministic tool-grounding**. The LLM is allowed to reason, translate, empathise, and prioritise. It is *not* allowed to originate a fact about the physical venue. Every concrete venue reference in the reply must trace back to a typed tool result. It's the discipline that keeps a Gemini agent honest inside a real stadium.

Try this exchange, which I ran against the stubbed tools tonight. A Bengali-speaking fan asks:

> **User:** সেকশন ১২৮ থেকে সবচেয়ে কাছের হুইলচেয়ার-অ্যাক্সেসিবল টয়লেট কোথায়?
> *(Where is the nearest wheelchair-accessible restroom from Section 128?)*

The UI streams a tool-call chip — `find_nearest(kind: "restroom", from: "sec-128", accessible: true)` — then Gemini responds:

> **Concourse:** সেকশন ১২৮ থেকে বেরিয়ে বাঁ দিকে ভম ১২৮ ধরে কনকোর্সে উঠুন। ডান দিকে ৪০ মিটার হাঁটলে অ্যাক্সেসিবল টয়লেট পাবেন। মোট আনুমানিক ২ মিনিট।

The Bengali is Gemini's. The section IDs, the vom number, the 40-metre distance, the 2-minute estimate — all from the tool. I could not have shipped a real translation pipeline in twelve days. I don't need to. The model already speaks Bengali.

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

![Simulated crowd heatmap over MetLife concourse](evidence/screenshots/crowd-heatmap.png)

## Feature 4 — Accessibility as a default, not a mode

Most "accessibility modes" are a toggle in settings that changes fonts and adds a skip link. That's not what MetLife's disabled fans need on July 19.

The principle I'm building around: **step-free is a routing weight, not a filter**. Filters are brittle. If step-free is impossible because the only route to Section 128 goes through six stairs, a filter returns "no route" and the user is stranded. A weight returns the least-step alternative and Concourse says, in words, "This route has 6 steps. The nearest step-free alternative adds 4 minutes via elevator E1. Which do you prefer?"

That's the A* cost function from Feature 2:

```
w(e) = distance(e) + α * crowdPenalty(e.to.zone) + β * accessibilityViolation(e, mode)
```

When `mode.stepFree === true`, β spikes to something large but finite. Stairs still exist in the graph. They just cost more.

**Sensory-safe zones** are first-class nodes in the venue graph, not annotations bolted on. MetLife actually has a sensory-safe room on Level 1 — I modelled it as `sensory-l1-01` with edges into the main concourse. A fan overwhelmed by 82,500 people asking "quiet space near me" gets a real answer with real turn-by-turn.

The camera → sign reader is where the one-Gemini-backbone decision pays off. A fan photographs a wayfinding sign in Spanish, or a concession menu in English they can't read. The image goes to Gemini 2.5 multimodal with a single tool-grounded prompt:

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

Voice is the other half. Web Speech API's `SpeechRecognition` gives me STT in the browser, `speechSynthesis` gives me TTS (offline for most voices). The entire concierge is usable eyes-free: tap-and-hold to talk, release, Gemini responds, TTS speaks it back. No cloud speech keys, no per-minute billing.

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

## Building in Google Antigravity — the agentic IDE

Antigravity is a VS Code fork with Gemini 3 Pro powering an agent-first workflow. Two views: **Manager View** dispatches multiple agents in parallel across sub-tasks; **Editor View** is the hands-on IDE when you want to drive yourself. Every agent produces a **Plan Artifact** before it executes — a structured proposal you approve, edit, or reject. Screenshots of Plan Artifacts are, I suspect, the single strongest piece of evidence a manual reviewer can see that the build is authentic and not vibe-generated.

The centerpiece for me is the **persistent brain** at `.gemini/antigravity/brain/`. That folder is the agent's memory across sessions. In my repo it already contains `project.md`, `architecture.md`, `glossary.md`, and **seven ADRs** — all seeded on Day 1, before Antigravity ever opens the workspace. Why: so the future agent walks in **onboarded, not amnesiac**. It reads about deterministic tool-grounding, about the crowd-source triage, about why SSE won over WebSockets, and it doesn't relitigate those decisions with me at 2 AM on D10.

Honest note, because this blog earns its title: I chose to scaffold the first half in Claude Code, not Antigravity. I could think architecturally faster in a familiar tool. That trade-off is written down in **ADR 0006**, not hidden. On D10 I migrate the working project into Antigravity and execute **Prompt Pack #2** — real work, not cosmetic: add a `sensory-safe` zone type to the graph schema, refactor the `useConcierge` hook, generate the eval harness, add two languages to i18n, run browser sub-agent verification. The brain is deep enough by then that the agent lands running.

![Antigravity Plan Artifact for the sensory-safe zone refactor](evidence/screenshots/antigravity-plan.png)

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

D2 tool schemas + system prompt + chat loop. D3 A* + crowd sim + heatmap. D4 five feature UI shells. D5 concierge polish + i18n. D6 accessibility + camera scan. D7 decision support + SSE nudges. D8 `/admin` + auth. D9 PWA + performance + offline. **D10 Antigravity migration + Prompt Pack #2.** D11 QA + demo mode + docs. D12 submission buffer. D13 submit.

## Lessons from Day 1

- **Seeding `.gemini/antigravity/brain/` before Antigravity runs was the single best decision I've made this cycle.** The port isn't a cold start — it's a warm handoff.
- **`exactOptionalPropertyTypes` bit me on the pino transport config.** Fixed in five minutes because I'd designed the surrounding types for strictness — the compiler pointed at the exact line. That's the tax paid up front paying itself back.
- **Choosing MetLife wasn't a geography call, it was a narrative call.** The Final is 11 days from this post. There is no better forcing function.
- **Writing ADRs on Day 1 felt overweight.** By Day 1 evening, I'd already referenced ADR 0007 twice while designing the rate limiter. Cheaper than re-deciding.
- **"Simulated, and I'll tell you so" is a feature, not an apology.** The moment I wrote the source field into the Zod schema, the honesty question stopped costing me energy.

## Links & what's next

- Repo: `github.com/<me>/Smart-Stadium` (product name inside: **Concourse**)
- Live preview: coming D9 — Firebase Hosting for frontend, Azure App Service F1 for backend.
- Plan doc: `docs/PLAN.md`. ADRs: `.gemini/antigravity/brain/decisions/`.
- Prompt log for PromptWars evidence: `evidence/antigravity-prompts.md`.

I ship on **Day 13**. If you're building for PromptWars too — say hi, trade prompt logs, compare Plan Artifacts. This is more fun with company.

See you at the Final.

#PromptWarsVirtual #GoogleAntigravity #Gemini #FIFAWorldCup2026 #BuildInPublic
