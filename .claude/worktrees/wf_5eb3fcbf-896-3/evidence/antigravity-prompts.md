# Antigravity Prompt Log

Every prompt dispatched into Antigravity's Manager View, in chronological order. Each entry captures the intent, the plan artifact Antigravity produced, and what actually shipped. This log is the authenticity trail for the manual PromptWars review; it also becomes primary material for the Build-in-Public blog.

Convention: entries are appended, never edited. If a prompt was refined, the refinement is a new entry with a link back.

Format:

```
### PP<pack>-<seq> — <one-line intent>
Date: YYYY-MM-DD HH:MM IST
Autonomy: agent-assisted | agent-driven | review-driven
Model: gemini-3-pro | claude-sonnet-4-5 | gpt-oss

Prompt (verbatim):
  <text>

Plan artifact (path in evidence/ if screenshotted):
  <path or "not saved">

Walkthrough summary:
  <2–4 sentences of what the agent actually did>

Verification:
  <what we checked and how>

Ship or revert:
  <shipped | reverted | shipped-with-fixes>
```

---

_No entries yet. First entry lands on D10 when Antigravity migration begins per ADR 0006._
_Prompt Pack #1 templates live in `docs/PLAN.md` §1.8._
