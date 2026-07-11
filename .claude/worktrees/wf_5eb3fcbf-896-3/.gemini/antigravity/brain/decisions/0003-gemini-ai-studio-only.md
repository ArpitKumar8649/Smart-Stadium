# ADR 0003 — Gemini via AI Studio only

_Status: Accepted · Date: 2026-07-08_

## Context

Google offers Gemini through two channels: **Google AI Studio** (developer-facing, generous free tier, no credit card required) and **Vertex AI** (enterprise-facing, richer features, requires a billing-enabled GCP project).

The developer does not have a credit-card-enabled GCP account. Adjacent Google Cloud APIs — Speech-to-Text, Text-to-Speech, Cloud Vision, Cloud Translation — also require billing.

## Decision

- **All LLM traffic goes through Google AI Studio** — `gemini-2.5-flash`, `gemini-2.5-pro`, `text-embedding-004`. One API key. No Vertex.
- **Voice**: Web Speech API in the browser (native, free, no key). No Cloud STT/TTS.
- **Vision**: send image bytes directly to Gemini 2.5 Pro multimodal. No Cloud Vision.
- **Translation**: instruct Gemini via system prompt to respond in the user's language. No Cloud Translation.

## Consequences

Positive:
- Zero-CC path from dev to production
- One API key to manage instead of five
- Gemini 2.5 multimodal for vision is arguably *better* than Cloud Vision for our use case — it can reason about a wayfinding sign, not just OCR it
- Web Speech API works offline for TTS, huge PWA win

Negative:
- **AI Studio free tier is capped: 15 RPM / 1500 RPD on Flash.** We handle this with a token-bucket rate limiter + queue + graceful "one moment" (see ADR 0007).
- Web Speech API accuracy is slightly below Cloud STT (acceptable for demo).
- No SLA on AI Studio — Vertex would have offered enterprise SLAs.

Non-obvious:
- If we later need to scale, the migration path is Vertex AI — the `@google/genai` SDK's function-calling shape is compatible. Not a rewrite.
- The blog will explain this trade-off transparently as an accessibility-for-builders story ("here is how we shipped a real product without a credit card").
