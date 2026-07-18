# Testing quality standard

Smart-Stadium targets a **qualitative 97+/100 testing score**. This is not a promise that every raw coverage counter is 97%; it is an assurance standard for meaningful, low-flake tests across the behavior that matters to fans, operators, and maintainers.

## What must be true before claiming 97+/100

- Frontend unit/component/hook tests pass with coverage enabled.
- Backend Vitest tests pass.
- Existing and added Playwright browser flows pass against the real app/server harness.
- TypeScript, ESLint, production build, and the browser-bundle credential scan pass.
- Every public route has a behavior-level test at the right layer.
- Stateful hooks and providers cover success, error, cleanup, persistence, and boundary paths.
- Accessibility, cache/offline, realtime/SSE, streaming, admin authorization, and PWA recovery are represented.
- Renderer-heavy Cesium/Three/Leaflet surfaces are not pixel-tested in jsdom; their app-owned data transforms, fallbacks, and user journeys are covered with mocks plus E2E.

## Behavior matrix

| Area | Unit / pure | Hook / provider | Component / route | Browser E2E | Quality expectation |
|---|---|---|---|---|---|
| Accessibility preferences | Preference defaults and persisted state | `A11yProvider`, `useA11y`, `useReducedMotion` | `A11yTogglePanel`, route controls | Primary keyboard/focus smoke | Preferences persist, reflect in DOM, and remain keyboard-operable. |
| Online/offline and cache | `stadiumCache`, route-key normalization, TTL | `useOnlineStatus` | `OfflineBanner`, cached route fallback | Offline/cache smoke where deterministic | Network loss degrades to cached/safe UI without throwing. |
| Realtime alerts | Alert fixtures and expiry dates | `AlertProvider` SSE sync, dedupe, reconnect, cleanup | Alert feed in `/navigate` | Operator-to-fan advisory flow | Alerts reach fan routes and rerouting is observable. |
| Concierge streaming | SSE frame parsing behavior through `useConcierge` | Cancellation, errors, history bounds | `MessageBubble`, `ToolCallChip`, `/concierge` shell | Basic concierge flow where deterministic | Streaming and tool states remain understandable and cancellable. |
| Live captions and sign reading | PCM downsampling | `useLiveCaptions` audio/socket lifecycle | `LiveCaptionPanel`, `SignReader` | Accessibility smoke | Media resources clean up and errors are user-visible. |
| Navigation and crowd map | `crowdStyle`, `floorData`, route transforms | Cache fallback through route consumers | `MapCanvas`, `/navigate` form/forecast/zone detail | Existing navigate E2E | Route, density, forecast, and fallback semantics match app contracts. |
| Admin operations | Briefing/TTS fixtures | Authorization-expiry callbacks | `/admin`, `PaTranslatorPanel` | Existing operator/fan E2E | Protected controls handle rejected tokens and failed services safely. |
| PWA/lazy recovery | Preload cooldown logic | Service-worker reload callback | App lazy-route fallback | Browser update checks if deterministic | Stale chunks reload once, not in a loop. |
| Renderer boundaries | Floor/section/route data transforms | N/A | Mocked `ConcourseMap` fallback behavior | User journey validates real visual surface loads | Avoid brittle WebGL/tile assertions while covering owned logic. |

## Coverage policy

Coverage is enforced for application-owned, testable frontend code and reported in CI. The coverage configuration deliberately excludes entrypoints, test helpers, and direct vendor-renderer wrappers that are validated through data-transform tests, mocked component tests, and Playwright flows. Exclusions must be justified here; they are not a place to hide untested business logic.

The current thresholds are minimum regression guards. Raising them is welcome after the behavior matrix is fully represented and tests remain deterministic.

## Verification commands

```bash
npm run typecheck
npm run lint
npm run test -w frontend
npm run test:coverage -w frontend
npm run test
npm run test:e2e -w frontend
npm run build
```

After `npm run build -w frontend`, CI also scans `frontend/dist` for server credential markers.
