# Concourse

**Your AI companion at every gate, seat, and section.**

A GenAI-powered stadium companion built for **PromptWars Virtual Challenge 4** (Google Cloud × Hack2Skill) — Smart Stadiums & Tournament Operations, timed to the **FIFA World Cup 2026 Final** at MetLife Stadium.

## What it does

Concourse is one product with five capabilities powered by a single Gemini agent backbone:

1. **Multilingual conversational concierge** — chat + voice, 30+ languages
2. **Smart indoor navigation** — A* routing over a hand-modelled MetLife venue graph, narrated by the LLM
3. **Live crowd & queue awareness** — simulated real-time density feeding routing and alerts
4. **Accessibility mode** — step-free routing, sensory-safe zones, camera→sign reader, TTS/STT
5. **Real-time fan decision support** — proactive nudges via SSE (gate change, delay, "leave now")

Plus a lightweight `/admin` view (crowd heatmap, incident injector, aggregated fan-query feed) so the four target personas — fans, organizers, volunteers, staff — are all covered in one product.

## Stack (no credit card required)

- **AI:** Gemini 2.5 Flash + Pro via Google AI Studio (function-calling, multimodal, native translation)
- **Frontend:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Framer Motion + react-i18next → Firebase Hosting
- **Backend:** Node 20 + Express + TypeScript + Zod → Azure App Service F1 (Student subscription)
- **Realtime:** Firestore + Server-Sent Events
- **Voice:** Web Speech API (browser-native)
- **IDE:** Google Antigravity (mandatory for PromptWars)

## Repo layout

```
concourse/
├── shared/       Zod schemas + TS types shared by FE and BE
├── backend/      Express API + Gemini agent + crowd sim
├── frontend/     React app (5 features + /admin)
├── data/         MetLife venue graph, fixtures, RAG corpus
├── docs/         PLAN.md, architecture, runbook, blog outline
├── evidence/     Antigravity prompts + screenshots for the blog
├── .gemini/      Antigravity brain (persistent project memory)
└── .agents/      Antigravity workspace rules (guardrails)
```

## Dev bootstrap

```bash
nvm use                          # Node 20.11.1
npm install                      # installs all three workspaces
cp backend/.env.example backend/.env      # add your AI Studio key
cp frontend/.env.example frontend/.env    # add Firebase Web config
npm run dev                      # FE :5173, BE :8080
```

Health check: `curl http://localhost:8080/api/health`

## Plan & progress

- Full implementation plan: [`docs/PLAN.md`](docs/PLAN.md)
- Day-by-day timeline is inside PLAN.md Section 5

## Licence

MIT — see `LICENSE`.
