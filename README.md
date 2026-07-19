# Concourse

**A GenAI-enabled smart-stadium platform for fans, venue staff, and tournament organizers at the FIFA World Cup 2026.**

Built for **PromptWars Virtual – Challenge 4: Smart Stadiums & Tournament Operations**.

[Live demo](https://concourse-stadium.web.app) · [Repository](https://github.com/ArpitKumar8649/Smart-Stadium) · [Azure API health check](https://concourse-api-arpit-b3eha5agdcfgg9hp.centralindia-01.azurewebsites.net/api/health)

## Challenge 4 alignment

> *"Build a GenAI-enabled solution that enhances stadium operations and the overall tournament experience for fans, organizers, volunteers, or venue staff. The solution must leverage Generative AI to improve navigation, crowd management, accessibility, transportation, sustainability, multilingual assistance, operational intelligence, or real-time decision support during the FIFA World Cup 2026."*

Concourse addresses every named area of the challenge and serves three of the
four named personas — **fans**, **venue staff**, and **tournament organizers** —
with a single platform anchored on MetLife Stadium (the July 19, 2026 Final).

| Challenge 4 area | Where it lives in Concourse |
| --- | --- |
| **Navigation** | Indoor A* routing over a bundled 3,479-node MetLife graph with fastest, step-free, sensory-safe, and low-crowd modes ([`backend/src/services/graph/astar.ts`](backend/src/services/graph/astar.ts)). |
| **Crowd management** | Labelled crowd density and queue projections drive a low-crowd routing mode and a heatmap for staff ([`backend/src/services/crowd/simulator.ts`](backend/src/services/crowd/simulator.ts)). |
| **Accessibility** | Step-free and sensory-safe routing, large-text and reduced-motion preferences, live captions, a camera sign-reader workflow, and TTS/ASR audio flows. |
| **Transportation** | A dedicated second agent — the **Transit Agent** — with its own system prompt and bounded toolset plans every ground-travel mode (driving / public transit / two-wheeler / cycling / walking) to MetLife via the Google Routes API. The concierge delegates any "how do I get to the stadium" question via a `transit_handoff` tool (real multi-agent orchestration). |
| **Sustainability** | The Transit Agent attaches a per-passenger CO₂ estimate (grams) to every mode, sourced from a bundled DEFRA 2023 emissions-factor table. A deterministic Pareto-aware scorer ranks the options on time *and* carbon and picks the balanced-optimal recommendation with the CO₂ saved vs. driving. The UI card labels every number honestly as an estimate, not a measurement. |
| **Multilingual assistance** | Ten selectable response languages with Qwen-backed streamed answers and grounded venue tools. |
| **Operational intelligence** | The Tournament Operations Console produces a structured AI briefing (headline, concerns, recommendations) from the live crowd and incident state ([`backend/src/routes/admin.ts`](backend/src/routes/admin.ts)). |
| **Real-time decision support** | Server-Sent Event advisories reach fan devices in seconds; the fan navigation view excludes affected graph nodes and re-plans the route automatically ([`backend/src/routes/alerts.ts`](backend/src/routes/alerts.ts), [`backend/src/routes/navigation.ts`](backend/src/routes/navigation.ts)). |

## Users

Concourse serves three personas that Challenge 4 names:

- **Fans** — find facilities, understand signs, plan accessible routes, compare
  crowd-aware options, get multi-mode travel guidance to the venue, and receive
  live advisories on a phone.
- **Venue staff** — operate the Tournament Operations Console: inspect the
  crowd heatmap, inject an incident or crowd override, and receive a structured
  AI briefing on demand.
- **Tournament organizers** — consume the same operations briefings and SSE
  advisory stream as evidence artifacts for coordination across the venue.

Large venues are difficult to navigate under time pressure — especially for
fans who do not share the venue's language, need a step-free route, are trying
to avoid a busy concourse, or receive an operational change mid-journey. Static
maps and FAQ pages cannot combine those needs into a decision. Concourse can.

## Solution

Concourse is a mobile-first React PWA backed by a TypeScript/Express API. A
Qwen-model concierge receives the fan's question and relevant context, then
uses bounded tool calls for facts that must be deterministic: venue lookup,
indoor routing, facilities, crowd state, and multi-mode outdoor travel routes.

The model explains the decision and is instructed to ground venue facts in
deterministic tools. Direct route results come from the bundled venue graph and
the backend route engine; any AI-generated explanation remains clearly a model
response rather than a source of truth.

The architecture is genuinely agentic. The **concierge** owns fan Q&A. The
**Transit Agent** — a second, peer agent with its own system prompt and
bounded tools — plans multi-modal ground travel to the stadium with per-mode
CO₂ scoring. The concierge delegates transportation questions to it through
a `transit_handoff` tool, giving Concourse a real multi-agent
orchestration pattern. The **Tournament Operations Console** owns venue-staff
decision support with structured AI briefings on demand.

## How context becomes a decision

| Fan context | What changes |
| --- | --- |
| Chosen language | The concierge receives the language and responds accordingly. |
| Optional GPS location | The concierge computes multi-mode outdoor travel routes to the stadium (drive / transit / two-wheeler / cycle / walk). |
| Step-free preference | The concierge receives the preference; A* routing heavily penalizes stairs/escalators and clearly warns if a fully step-free path is unavailable. |
| Sensory-safe route mode | A* adds penalties for stairs/escalators and narrow mapped corridors. |
| Low-crowd route mode | A* adds a cost from the current simulated crowd density to steer away from congestion. |
| Simulated crowd state | Current density and queue estimates inform low-crowd routes and answers; short-term forecasts are shown in crowd answers, not used as route-edge weights. |
| Operational incident | Venue staff publish an advisory from the Tournament Operations Console; connected fan navigation views excludes the affected node and re-plans automatically. |

The concierge's tool loop is capped, inbound data is validated with shared Zod
schemas, and a rate limiter protects quota-limited AI routes.

## Core capabilities

- **Navigation:** A* routes over the bundled MetLife venue graph with fastest,
  step-free, sensory-safe, and low-crowd modes.
- **Crowd management:** visibly labelled crowd density, projected trend, and
  queue estimates informing both fan routing and the staff briefing.
- **Accessibility:** large-text and reduced-motion preferences, step-free and
  sensory-safe routing, live captions, and a camera sign-reader workflow.
- **Transportation:** a specialist Transit Agent plans all five ground-travel
  modes (drive / public transit / two-wheeler / cycle / walk) to MetLife via
  Google Routes, invoked by the concierge through a `transit_handoff` tool.
- **Sustainability:** the Transit Agent attaches a per-passenger CO₂ estimate
  to every mode from the bundled DEFRA 2023 emissions-factor table, and a
  deterministic Pareto-aware scorer surfaces the fastest, greenest, and
  balanced-optimal recommendation with the CO₂ saved vs. driving.
- **Multilingual assistance:** ten selectable response-language preferences
  with Qwen-backed, streamed answers and grounded venue tools.
- **Operational intelligence:** the Tournament Operations Console produces an
  AI briefing (headline, concerns, recommendations) from the live crowd and
  incident state.
- **Real-time decision support:** Server-Sent Event advisories reach fans in
  seconds; the fan view excludes affected nodes and re-plans the route
  automatically.
- **Phone-conscious delivery:** route-level lazy loading, deferred 3D view and
  tile initialization, lazy trophy rendering, mobile GPU quality limits, and
  cached map/route assets.

## How it works

```text
Fan PWA
  ├─ chat / accessibility / navigation UI
  ├─ cached map and route assets
  └─ HTTPS + SSE
       ↓
Azure Node.js API
  ├─ request validation and rate limits
  ├─ Qwen-model concierge with bounded tools
  ├─ deterministic A* route engine
  ├─ simulated crowd and alert stream
  └─ protected operations endpoints
       ↓
Bundled MetLife graph + optional external routing/AI services
```

The bundled venue graph contains **3,479 nodes and 8,167 edges**. The API
loads it once, while pure routing and crowd-simulation code remain separately
testable.

## Assumptions and demo boundaries

- The venue is represented by a bundled MetLife graph. It is suitable for this
  demo; production deployment requires venue-owner validation and updates.
- Crowd readings are **simulated** and labelled as such in the user
  experience. The crowd store carries a `source` field (`sim` / `injected` /
  `sensor`) so real venue telemetry is a one-adapter swap.
- Outdoor transportation routing uses a server-side Google Routes API key, and
  the key is already configured for the hosted demo. Indoor routing remains
  available with or without it.
- The Tournament Operations Console (`/admin`) is protected by a server-only
  passcode with fail-closed 401s, rate limits, and constant-time token
  comparison. It is a demo-tier authentication posture, not a full multi-user
  identity system.
- The live frontend is served from [Firebase Hosting](https://concourse-stadium.web.app).
  Its browser requests require the Azure API CORS allowlist described in
  [the deployment guide](docs/FIREBASE_FRONTEND_DEPLOYMENT.md).

## Repository layout

```text
frontend/  React + Vite fan and operations interfaces
backend/   Express API, concierge, routing, crowd, alerts, audio, vision
shared/    Zod schemas and shared TypeScript contracts
data/      Venue graph, fixtures, and concierge system prompt
docs/      Deployment instructions and evaluation evidence
```

## Run locally

### Prerequisites

- Node.js 22 LTS
- A DashScope API key for Qwen models (only needed for AI-backed features)

```bash
git clone https://github.com/ArpitKumar8649/Smart-Stadium.git
cd Smart-Stadium
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set at least `DASHSCOPE_API_KEY` and an `ADMIN_DEMO_TOKEN` in `backend/.env`.
Use a randomly generated 32+ character token for deployment; keep every secret
server-side. Then start both apps:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080/api/health`

## Validate the project

```bash
npm run build --workspace=shared
npm run typecheck
npm run lint
npm run test
npm run build
```

The automated suite covers the A* routing modes, crowd simulation, agent-tool
grounding, shared API contracts, request validation, fail-closed admin access,
and anonymous PA/TTS denial.

## Demo walkthrough

For a reproducible judge flow, open the [fan navigation view](https://concourse-stadium.web.app/navigate) and the [Tournament Operations Console](https://concourse-stadium.web.app/admin) side by side:

1. The fan view starts with an editable Section 144 → Section 108 route over the bundled graph.
2. In the Tournament Operations Console, authenticate with the server-held passcode and select **Trigger 100 Concourse route advisory**.
3. The fan view receives the SSE advisory, excludes the affected graph node, and refreshes its route automatically. The route card announces the refresh and still exposes a manual re-plan fallback.

The scenario is simulated for the hackathon; the crowd store carries a
`source` field so real venue telemetry is a one-adapter swap.

## Deployment

- **Backend:** Azure Linux Node.js Web App, deployed by
  [GitHub Actions](.github/workflows/deploy-backend-azure.yml). See
  [Azure deployment](docs/AZURE_BACKEND_DEPLOYMENT.md).
- **Frontend:** Firebase Hosting, deployed by
  [GitHub Actions](.github/workflows/deploy-frontend-firebase.yml) once its
  repository variables and service-account secret are configured. See
  [Firebase deployment](docs/FIREBASE_FRONTEND_DEPLOYMENT.md).

## Evaluation evidence

See [docs/EVALUATION.md](docs/EVALUATION.md) for a concise map from each
hackathon criterion to the relevant implementation and validation evidence.
