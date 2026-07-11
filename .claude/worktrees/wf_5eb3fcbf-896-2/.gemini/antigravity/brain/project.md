# Concourse — Project Brain

_Read this first. Every Antigravity session starts by loading this file._

_Last updated: 2026-07-08 (Day 1 — scaffold)_

---

## Mission

Build a unified GenAI companion that helps fans, volunteers, and venue staff navigate the physical experience of the **FIFA World Cup 2026** — starting with the Final venue, **MetLife Stadium, East Rutherford NJ** (Final: 2026-07-19, 3 PM ET).

Concourse is **not** a chatbot bolted onto a stadium website. It is one Gemini agent — with tools over the venue graph, live crowd data, match state, and multimodal input — that communicates in the fan's own language.

## Elevator pitch

> Ask Concourse anything about your matchday — in Bengali, Arabic, or Spanish — and it answers with the specific gate, the step-free route, the current wait time, and the exact minute to leave.

## Target users (priority order)

1. **Fans** attending a match at MetLife — the primary persona everything is optimised for
2. **Volunteers & venue staff** — served by the `/admin` route (heatmap, incident injector, aggregated queries)
3. **Accessibility users** — a first-class default, never a mode. Every route response includes a step-free variant even when not asked.

## Locked scope — Cluster A

Five fan-facing capabilities powered by one shared Gemini backbone, plus one admin view. Do these, do them well.

1. **Multilingual conversational concierge** (chat + voice, 30+ languages)
2. **Smart indoor navigation** (A* over hand-modelled MetLife graph, LLM narrates)
3. **Live crowd & queue awareness** (simulated, transparent — see decisions/0005)
4. **Accessibility mode** (step-free routing + sensory-safe zones + camera-scan + TTS/STT)
5. **Real-time fan decision support** (SSE nudges: gate change, delay, "leave now to catch the metro")

Plus `/admin` route: crowd heatmap, incident injection, top-fan-questions feed, crowd-override sliders, and an **AI Operational Briefing** panel (Gemini 2.5 Pro every ~5 min, per ADR 0009).

## Non-goals — hard limits

Explicitly out of scope. Do not add them even if the schedule allows spare time.

- **No transportation integrations** — no metro/parking/TNC APIs. Transportation appears only as an LLM-reasoned nudge based on time math.
- **No sustainability sensors** — mentioned as future scope in the blog only.
- **No standalone staff dashboards** — the `/admin` view is a thin mirror over the same data, not a separate product.
- **No native mobile apps** — PWA only.
- **No user accounts beyond Firebase Auth guest + Google sign-in** — no email/password, no full profile UX.
- **No paid third-party APIs** — every runtime service must be free-tier.
- **No languages we cannot test end-to-end** — 12 seed languages with full react-i18next JSON; rest fall back to runtime Gemini translation with a UI indicator.

## Hard constraints — non-negotiable

- **12 usable build days** (D1..D12), one developer, submission on D13
- **Every runtime service must be free-tier** (no credit card):
  - Gemini via Google AI Studio (not Vertex AI)
  - Firebase Spark plan (Hosting, Auth, Firestore, Storage)
  - Azure App Service F1 (Student subscription)
- **Google Antigravity is the mandatory build tool** per PromptWars rules
- The app must have a **live preview URL** at submission time — this is a hard evaluation gate
- **Gemini AI Studio free tier**: Flash 15 RPM / 1500 RPD. The whole app must stay under this ceiling for demo traffic. See `decisions/0007` for the semaphore + queue design.

## Success criteria (in evaluator order)

1. **Live preview responsive** at submission time and during Top-50 manual review window
2. Every locked feature is **demonstrable end-to-end** with no dead paths
3. Build-in-Public blog is **deep, honest, and Antigravity-narrated** (screenshots of Plan Artifacts)
4. LinkedIn post has a **specific "wow" moment**, not a generic summary
5. Repo shows an **authentic Antigravity artifact trail** — this `brain/`, populated `evidence/`, real ADRs

## Pattern for uncertainty

When an Antigravity agent (or the human developer) is uncertain about a choice, apply these in order:

1. **Prefer whatever keeps the live preview reliable.** A boring choice that stays up beats a clever one that crashes.
2. **Prefer honest simulation over faked realism.** Manual reviewers detect fakes. The blog leans into "here is what is simulated and how it would connect to real sensors."
3. **Prefer accessibility as a default, not a mode.** Every route ranks step-free variants alongside fastest.
4. **Prefer privacy-preserving primitives.** No facial recognition, no individual tracking, aggregate only — see ADR 0010.
5. **Prefer one shared Gemini backbone over per-feature LLM calls.** Function-calling with tools, not scattered prompts.
6. **When still stuck, log the question to `decisions/pending.md` and pick the cheapest reversible choice.** Do not block on architecture debates.

## Voice — how Concourse speaks to fans

- **Direct, technical, warm.** Concourse addresses fans like a knowledgeable friend who already knows the stadium.
- **Never says "please" more than once per turn.** Warmth ≠ obsequiousness.
- **Never apologises for being AI.** Refers to itself as "Concourse", not "I".
- **Never invents a gate number or section.** Any concrete venue reference must come from a tool result. If the tool cannot answer, Concourse says so plainly.
- **Always answers in the fan's detected language,** even when internal reasoning happened in English.
- **Never uses more than ~60 words for a routing answer.** Fans are walking; brevity is respect.

## Where to find things (map of the repo)

- Full 5-section plan: `docs/PLAN.md`
- Domain terms: `.gemini/antigravity/brain/glossary.md`
- Architecture: `.gemini/antigravity/brain/architecture.md`
- Every reasoned choice: `.gemini/antigravity/brain/decisions/*.md`
- Enforced rules: `.agents/rules/*.md`
- Antigravity prompt log: `evidence/antigravity-prompts.md`
