# Rule 00 — House style

_Passive constraints. Applied to every agent turn and every generated file._

## TypeScript

- **Strict mode always.** `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
- **No `any`.** Use `unknown` at boundaries and narrow with Zod. If you truly need `any`, add a `// TODO(any): reason` comment.
- **No non-null assertions (`!`) in application code.** Narrow types properly. `!` is allowed only in tests and rare framework escape hatches.
- **Prefer `type` over `interface`** unless declaration merging is needed.
- **Zod schemas live in `shared/src/schemas/`** and are the single source of truth for request/response shapes. Types are inferred with `z.infer<typeof X>`.

## Naming

- Files: `kebab-case.ts`. React components in `PascalCase.tsx`.
- Functions and variables: `camelCase`.
- Types and React components: `PascalCase`.
- Constants: `SCREAMING_SNAKE_CASE` only for true compile-time constants (`VENUE_ID`, `MATCH_KINDS`).
- Never abbreviate unless the abbreviation is a domain term (`a11y`, `i18n`, `LLM`, `RPM` are fine; `usr`, `cfg`, `mgr` are not).

## Comments

- Default is **no comment**. Well-named identifiers are the documentation.
- Comments explain *why*, never *what*. If a comment explains what the code does, rename the code.
- Load-bearing invariants get one short line (`// Fan asks in Bengali → reply must be Bengali; enforced by system prompt.`).

## Errors

- Never swallow errors. Every catch either handles or re-throws with context.
- Every backend endpoint returns errors in a consistent envelope: `{ error: { code, message, requestId } }`.
- The Gemini agent loop treats tool errors as data — it does not throw them through to the client.

## Testing

- Vitest everywhere. One test file per module lives next to it: `foo.ts` + `foo.test.ts`.
- Backend tests hit the express app in-process, not a real Azure instance.
- No mocks of Gemini for behavioural tests — use recorded fixtures.
