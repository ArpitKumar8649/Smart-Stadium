# ADR 0010 — Privacy by design

_Status: Accepted · Date: 2026-07-08 (grafted post-D1 planning review)_

## Context

External blueprint review flagged data privacy as both a real risk and
a differentiator most hackathon submissions gloss over. Concourse has
been privacy-preserving by default — no facial recognition, no
individual fan tracking, anonymous sessions — but that discipline is
implicit in the code, not documented. This ADR makes it explicit and
sets rules that future features must respect.

## Decision

**Concourse implements six privacy principles, in this order:**

1. **No facial recognition. Ever.**
   Not in the app, not in the crowd simulator, not in any migration
   path to real sensors. When ADR 0005's migration to real crowd data
   happens, the edge-CV path emits bounding-box vectors (movement flow
   only) and drops the frames within the same process. Faces never
   leave the camera sensor.

2. **Aggregate crowd, not individual location.**
   The crowd data model has no notion of a person — only zone-level
   density. It is architecturally impossible to answer "where is fan
   X" because the schema does not carry a fan identity in the crowd
   collection.

3. **Anonymous sessions by default.**
   Firebase Auth guest mode is the default. Google sign-in is optional
   and unlocks nothing except opt-in preference persistence across
   devices. No email/password auth, no phone auth, no third-party
   profile enrichment.

4. **Ephemeral chat.**
   The concierge does not persist chat history server-side by default.
   Session context (last ~10 turns) lives in memory for the duration
   of the SSE connection. Fans can opt in to save preferences
   (language, accessibility settings, favourite section) — everything
   else evaporates on tab close.

5. **Aggregated queries only for /admin.**
   The `top_fan_questions` feed shown in the AI briefing (ADR 0009) is
   COUNT-based, never full-text. "24 fans asked about halal food" is
   the shape; the underlying messages are never surfaced to the
   operator or stored in a way that could be joined back to a fan.

6. **Opt-in for notifications.**
   The Notification API prompt is deferred until the fan asks for
   proactive nudges. Never auto-triggered on landing.

Concretely enforced:
- Firestore security rules forbid the client from writing to any
  collection except `/sessions/{ownSessionId}` — no anonymous writes
  to crowd or incidents.
- Backend `pino` redaction (already configured in rule 10) covers
  `Authorization`, `Cookie`, `image_b64`, and the service-account
  JSON. Chat message bodies are not logged in production
  (`LOG_USER_INPUT=false` by default).
- Every `/api/admin/*` route requires a Firebase ID token verified
  against `ADMIN_UIDS` — no ambient admin auth.
- CORS in production is a single-origin allowlist, never `*`.
- The privacy stance is stated on the landing page in one sentence
  ("Concourse never uses facial recognition and never tracks
  individuals — only aggregate zone density"). Reviewers will notice
  its absence more than its presence.

## Consequences

Positive:
- Adds real differentiation in manual review without adding code.
  Most hackathon submissions do not surface a privacy stance at all.
- Migration path to real sensors (ADR 0005) is now constrained in a
  way that keeps privacy first, not bolted on later.
- Prevents scope creep: any feature that would require facial
  recognition, individual tracking, or persistent chat history is
  rejected up front.

Negative:
- Some legitimately useful features are ruled out (personalised "last
  time you sat in Sec 128" hooks require persistence — punted to
  v0.4 as opt-in).
- No commercial upsell surface. Not a v1 concern.

Non-obvious:
- The COUNT-based aggregation for admin queries is why the LLM
  briefing sees "24 fans asked about halal food" and not the
  original 24 messages. That means the briefing cannot leak an
  individual fan's phrasing — the primitive shape prevents it.
- The one-sentence landing-page statement is the most important
  privacy artifact in the whole product. Trust starts before the
  first tap.
