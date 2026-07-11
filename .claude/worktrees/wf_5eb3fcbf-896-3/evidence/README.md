# Evidence

Screenshots, walkthroughs, and prompt logs from Antigravity sessions. Manual PromptWars reviewers open this folder to verify the artifact trail is authentic.

## Layout

```
evidence/
├── antigravity-prompts.md      # chronological prompt log (append-only)
├── screenshots/                # Antigravity Plan Artifact + Walkthrough + Browser sub-agent screenshots
│   ├── ag-plan-<slug>.png
│   ├── ag-walkthrough-<slug>.png
│   └── ag-browser-verify-<slug>.png
└── walkthroughs/               # short markdown notes describing what a screenshot shows
    └── <slug>.md
```

## Rules

- Screenshots are named by kind + slug. Never `Screenshot 2026-07-15 at 09.42.15.png` — always `ag-plan-crowd-simulator.png`.
- Every non-obvious screenshot has a sibling `walkthroughs/<slug>.md` describing what to notice.
- Screenshots stay under 512 KB each (compress with `oxipng -o4` or equivalent). Anything over goes into `.gitignore`'s `evidence/raw-video/` bucket.
- No PII in screenshots. If a real Firebase UID or API key is visible, redact before committing.
