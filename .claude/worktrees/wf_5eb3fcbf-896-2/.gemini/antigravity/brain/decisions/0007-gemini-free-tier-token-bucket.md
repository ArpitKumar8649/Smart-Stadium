# ADR 0007 — Gemini free-tier ceiling handled by token bucket + queue

_Status: Accepted · Date: 2026-07-08_

## Context

Google AI Studio's free tier for `gemini-2.5-flash` is **15 requests per minute** and **1500 requests per day** (Pro is stricter). A public live demo — even one visitor asking three questions — can burst above 15 RPM easily. A 429 during the judge's evaluation session is catastrophic.

## Decision

Implement a two-layer defence in the backend:

1. **Token bucket rate limiter** in front of every Gemini call. Bucket size = 12 (leaves 3 RPM headroom for retries + admin-panel demo pushes). Refill rate = 12 per 60 seconds.
2. **In-memory FIFO queue** for calls that exceed the bucket. Queue depth cap = 20 (beyond that, respond with a friendly "one moment — Concourse is warming up" and log the drop).
3. **Retry on 429**: exponential backoff, max 2 attempts, then fall back to a canned answer.
4. **Client-side signal**: when a request is queued > 1s, stream a "one moment" placeholder token so the UI shows life.

For the judge demo we also pre-warm caches (venue graph, fixtures, RAG index) so the first user query does not race against a cold start.

## Consequences

Positive:
- No visible 429s during demo traffic
- The queue smooths bursts from the admin-panel demo (judge clicks "close food court 2" three times fast)
- The "one moment" pattern is honest and the wait is short

Negative:
- Adds ~100ms latency to bursty requests (invisible in demo, worth it)
- Not a real solution for a real-scale launch (real-scale would move to Vertex AI or self-hosting — noted in the blog)

Non-obvious:
- The bucket size of 12 (not 15) leaves 3 RPM headroom specifically so retries and admin-panel events cannot themselves cause a 429 cascade.
