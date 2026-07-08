# ADR 0001 — Monorepo with npm workspaces

_Status: Accepted · Date: 2026-07-08_

## Context

The project has three logical packages: `shared` (types + Zod schemas used by both sides), `backend` (Express + Gemini), and `frontend` (React PWA). We need to decide on the monorepo tooling.

Candidates considered:
- **Multi-repo** — three separate repos
- **Turborepo** — remote cache, incremental builds
- **Nx** — full workspace tooling with generators
- **pnpm workspaces** — content-addressed store, strict node_modules
- **npm workspaces** — built in to npm ≥ 7, no extra install

## Decision

**npm workspaces**, three workspaces: `shared`, `backend`, `frontend`.

## Consequences

Positive:
- Zero extra tooling to install; comes with Node 20
- One `npm install` at root installs and links all three
- `npm run dev -w frontend` targeting individual workspaces works out of the box
- CI runners understand it without extra setup
- Antigravity's terminal agent won't fight unfamiliar tooling

Negative:
- No remote caching (fine — we're one dev on one machine)
- No smart incremental builds (fine — 12-day project, everything rebuilds fast)
- Slightly less strict `node_modules` isolation than pnpm (acceptable; we're not fighting phantom deps)

Non-obvious:
- Multi-repo would have doubled our git overhead and complicated `shared/` reuse.
- Turborepo / Nx are optimized for problems we do not have (5+ apps, remote CI cache, generators). They add setup cost we cannot afford in a 12-day window.
