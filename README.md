# Concourse

**A context-aware smart-stadium companion for fans and tournament operations.**

Built for **PromptWars Virtual – Challenge 4**.

[Live demo](https://concourse-stadium.web.app) · [Repository](https://github.com/ArpitKumar8649/Smart-Stadium) · [Azure API health check](https://concourse-api-arpit-b3eha5agdcfgg9hp.centralindia-01.azurewebsites.net/api/health)

## Vertical, users, and problem

**Vertical:** Smart Stadiums & Tournament Operations.

Large venues are difficult to navigate under time pressure—especially for fans
who do not share the venue's language, need a step-free route, are trying to
avoid a busy concourse, or receive an operational change mid-journey. Static
maps and FAQ pages cannot combine those needs into a decision.

Concourse serves two users:

- **Fans:** find facilities, understand signs, plan accessible routes, compare
  crowd-aware options, and receive live demo alerts on a phone.
- **Operations staff:** inspect simulated venue conditions, inject a safe demo
  incident or crowd override, and receive a structured AI briefing.

## Solution

Concourse is a mobile-first React PWA backed by a TypeScript/Express API. A
Qwen-model concierge receives the fan's question and relevant context, then
uses bounded tool calls for facts that must be deterministic: venue lookup,
indoor routing, facilities, crowd state, and optional outdoor travel routes.

The model explains the decision and is instructed to ground venue facts in
deterministic tools. Direct route results come from the bundled venue graph and
the backend route engine; any AI-generated explanation remains clearly a model
response rather than a source of truth.

## How context becomes a decision

| Fan context | What changes |
| --- | --- |
| Chosen language | The concierge receives the language and responds accordingly. |
| Optional GPS location | The concierge can use it for optional outdoor travel routes to the stadium. |
| Step-free preference | The concierge receives the preference; A* routing heavily penalizes stairs/escalators and clearly warns if a fully step-free path is unavailable. |
| Sensory-safe route mode | A* adds penalties for stairs/escalators and narrow mapped corridors. |
| Low-crowd route mode | A* adds a cost from the current simulated crowd density to steer away from congestion. |
| Simulated crowd state | Current density and queue estimates inform low-crowd routes and answers; short-term forecasts are shown in crowd answers, not used as route-edge weights. |
| Operational incident | The protected admin console publishes an alert to connected navigation views during the running demo. |

The concierge's tool loop is capped, inbound data is validated with shared Zod
schemas, and a rate limiter protects quota-limited AI routes.

## Core capabilities

- **Multilingual concierge:** ten selectable response-language preferences with
  Qwen-backed, streamed answers and grounded venue tools. The hackathon shell
  itself is currently English.
- **Indoor wayfinding:** A* routes over the bundled MetLife venue graph with
  fastest, step-free, sensory-safe, and low-crowd modes.
- **Crowd-aware decisions:** visibly labelled simulated crowd conditions,
  projected density, and queue estimates—not a claim of live sensor data.
- **Accessibility support:** large-text and reduced-motion preferences,
  step-free routing, live captions, and a camera sign-reader workflow.
- **Fan alerts and operations:** Server-Sent Events for demo alerts plus a
  protected `/admin` console for incident and crowd scenarios.
- **Phone-conscious delivery:** route-level lazy loading, deferred 3D view and
  tile initialization, lazy trophy rendering, mobile GPU quality limits, and
  cached map/route assets. The current Cesium runtime remains a global build
  dependency and is a documented follow-up optimization.

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
- Crowd readings are **simulated** and are labelled as such in the user
  experience. An admin can inject a scenario to demonstrate the real-time
  workflow; this is not live stadium telemetry.
- Outdoor routing is optional and needs a server-side Google Routes API key.
  Indoor routing remains available without it.
- The admin console is a **demo-operator surface** protected by a server-only
  passcode and request limits. It is not a production multi-user identity or
  role-management system; do not share the passcode in a public frontend bundle.
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

For a reproducible judge flow, open the [fan navigation view](https://concourse-stadium.web.app/navigate) and `/admin` side by side:

1. The fan view starts with an editable Section 144 → Section 108 route over the bundled graph.
2. In the demo-operator console, authenticate with the server-held passcode and select **Trigger 100 Concourse route advisory**.
3. The fan view receives the simulated SSE advisory, excludes the affected graph node, and refreshes its route automatically. The route card announces the refresh and still exposes a manual re-plan fallback.

This is a simulated, venue-wide scenario for the hackathon—not a live stadium closure or individual fan tracking system.

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
