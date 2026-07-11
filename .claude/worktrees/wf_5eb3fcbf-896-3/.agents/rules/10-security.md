# Rule 10 — Security

_These are hard rules. Violations are auto-rejected in review._

## API keys and secrets

- **The Google AI Studio key never appears in git.** Not in code, not in tests, not in commit messages, not in issue titles.
- **Every `.env` file is gitignored** and every `.env.example` file has placeholder values only.
- **Secrets in Azure** live in App Service Application Settings, never in the deployed code bundle.
- **Secrets in GitHub Actions** live in repository secrets, referenced as `${{ secrets.NAME }}`.
- If a key is ever exposed in a commit (even a squashed one), rotate it immediately at aistudio.google.com and force-push the cleaned history — but only after confirming with the human developer.

## Logging

- **pino redacts sensitive fields by default.** Configuration in `backend/src/middleware/logger.ts` includes `req.headers.authorization` and `req.body.imageBase64` in the redaction list.
- **Never log full Gemini request bodies.** Log token counts and tool-call names only.
- **Never log user messages verbatim in production.** In dev only, gated behind `LOG_USER_INPUT=true`.

## CORS

- Backend allows exactly one origin in production (the Firebase Hosting URL). No wildcards.
- Dev allows `http://localhost:5173`.

## Input validation

- Every backend endpoint runs its input through a Zod schema from `shared/`. Never trust raw `req.body`.
- Every LLM tool implementation validates its arguments against a Zod schema before executing.

## Prompt injection

- The Concourse system prompt is loaded from a file that the runtime treats as sacred — never concatenated with user input.
- User messages are wrapped in `<user_message>...</user_message>` XML sentinels in the LLM turn.
- If a user message contains anything resembling `[system]`, `<system>`, `You are now`, or `ignore previous instructions`, log it and pass through — Gemini's own safety layer handles it; we do not sanitise input silently.

## Auth on admin routes

- Every `/api/admin/*` endpoint requires a Firebase ID token in the `Authorization: Bearer <token>` header.
- The middleware verifies the token, then checks the UID against an allowlist in `ADMIN_UIDS` env var. Anything else returns 401.
