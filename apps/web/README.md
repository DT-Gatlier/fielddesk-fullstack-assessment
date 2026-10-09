# FieldDesk frontend

Next.js App Router, React, strict TypeScript, Tailwind 4 and minimal shadcn-style
primitives. TanStack Query owns server state; React Hook Form/Zod validate forms.
The application uses the existing NestJS cookie-session API.

## Setup

From the repository root, install dependencies and configure the API/database as
described in the root README. Copy `apps/web/.env.example` to `apps/web/.env.local`
on first setup, preserving existing configuration. `NEXT_PUBLIC_API_URL` must be a
public HTTP(S) origin without credentials, paths or query parameters. Configuration
is checked when Next.js loads. The usual value is `http://localhost:3001`.

Run `pnpm dev`. The browser frontend runs at `http://localhost:3000`; the API must
allow this exact origin. Use matching hostnames for both services. Production
requires HTTPS and the backend's secure cookies; cross-site hosting needs a
deliberate cookie/routing design beyond this local same-site setup.

## Structure and conventions

Read [Frontend coding standards](../../docs/FRONTEND_STANDARDS.md) before frontend
changes. This is the shared reference for API folders, generated types, hooks,
authentication, accessibility and verification.

- `app`: routing, layouts and route-local private feature folders.
- `api`: generated OpenAPI types, credentialed client and central error handling.
- `modules/auth`: session query, CSRF requests, transitions, boundaries and hooks.
- Other `modules`: shared theme, query provider and application shell.
- `components/ui`: only the UI primitives actually used by the application.
- `lib`: public environment validation and shared pure helpers.

Use `_api`, `_hooks`, `_schemas`, `_components`, `_types` and `_utils` within
substantial route features as needed. Standardise on `_api`, not `_apis`. Shared
authentication belongs outside the login route. Use named components and plain
typed request functions; introduce abstractions only with actual consumers.
API models come from generated contracts, not database imports or handwritten copies.
Keep client boundaries focused and business authorization in NestJS. Preserve
semantic theme tokens, accessible labels/focus and responsive layouts in new screens.

## Authentication and themes

Authentication API responsibilities are separated in `modules/auth/api`:
`api.types.d.ts` aliases generated `LoginDto` and `UserResDto`; `auth-query.ts`
reads identity; `auth-mutations.ts` submits login/logout; `auth-transport.ts` owns
CSRF caching/recovery and authentication epochs. `auth-keys.ts` retains the
bootstrap session key, while `session-cache.ts` owns cache clearing. Safe return
paths and operation notifications live in `modules/auth/utils`. Request functions
do not show notifications. Form values remain inferred from Zod and are checked
against the generated login DTO at the mutation boundary.

`auth/me` is the single identity source. Protected content waits for session
resolution and is rechecked on navigation, window focus and reconnect. Dependency
failures present retry controls; only a confirmed unauthenticated response clears
identity. A protected business request returning 401 triggers a session recheck.

Login bootstraps anonymous CSRF, posts credentials, then fetches session CSRF and
identity. Tokens stay in memory; session credentials stay in HttpOnly API cookies.
Only the backend's identified `FORBIDDEN` / `Invalid CSRF token` response permits
one CSRF recovery retry. Invalid credentials and other mutations are not retried.
Logout fetches fresh CSRF so stale sessions can bootstrap anonymous protection.
Failed logout retains identity and permits retry.

Transitions cancel queries and clear private cache/mutation state. An authentication
epoch rejects older responses. Future private query keys must include organisation
and user IDs, plus filters/pagination. Requests must consume TanStack Query's abort
signal. BroadcastChannel messages contain only a change signal; other tabs clear
state and recheck identity. Browsers without BroadcastChannel recheck on focus,
reconnect and navigation. Theme preferences persist separately from private data.

Light and dark themes use semantic CSS variables. `next-themes` initializes the
document class before hydration, defaults to System and persists explicit choices.
The shadcn-style Radix dropdown offers Light/Dark/System from a 44px sun/moon
button. Icons follow the document theme class without reading theme-dependent
values during server rendering. Menu navigation supports keyboard focus and Escape.

The shared palette is blue in both themes, with locally hosted variable Inter and
system font fallbacks. Login uses a 46/54 desktop split and a compact mobile header.
Its branding and explicitly labelled example work orders are Server Components;
only the form, theme selector and session boundary need client interaction.

The login route keeps composition in `page.tsx` / `_components/login-layout.tsx`,
static branding in `login-brand-panel` / `login-preview`, form markup in
`login-form`, and password visibility in `password-field`. `_hooks/use-login-form`
owns validation, submission and redirects. `_hooks/use-input-visibility` and the
pure `_utils/viewport-visibility` calculation handle measured viewport occlusion.
Do not add whole-form subscriptions or memoization without profiling evidence.

Auth commands and session observation use separate contexts. Consumers use focused
`use-session`, `use-login` and `use-logout` hooks; mutation status stays with its
interface. Session observation, transitions and cross-tab listeners have separate
hooks. Initial loading happens inside the login panel; anonymous background checks
keep the same form mounted. Unavailable verification retains inputs, disables
submission and offers an Alert/retry. Protected content remains gated. Navigation
checks wait for cookie mutations, and cross-tab signals received during a mutation
are processed afterward. The initial session query is not redundantly refetched.

One themed Sonner toaster handles failed login/logout submissions. Credential and
network errors last eight seconds; rate-limit/service errors persist until closed
or superseded. Retry and authentication changes dismiss stale operation notices.
Field validation stays inline; background session failures do not produce toasts.

Mobile layout uses document scrolling, safe areas, `100vh`/`100dvh`, 16px inputs and
zoom-preserving viewport metadata. VisualViewport events are batched with animation
frames: scroll only an obscured focused input, add measured scroll space and skip
adjustments during pinch zoom. Listeners and pending frames are cleaned up.

## Commands

From the root: `pnpm codegen`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and `pnpm test:e2e`. Web-only checks use `pnpm --filter @fielddesk/web`.
Codegen reads `/docs-json` from the configured running API and commits
`src/api/schema.d.ts`. Ordinary checks/builds consume that file offline. Generated
definitions alone are excluded from formatting/linting; handwritten API code is checked.

## Isolated browser tests

Install browsers with `pnpm --filter @fielddesk/web exec playwright install chromium webkit`
(CI adds `--with-deps`). Supply explicit `E2E_DATABASE_URL` and `E2E_REDIS_URL`.
The PostgreSQL URL must name `fielddesk_web_test`, on a disposable test server. The
database must have an empty public schema: preparation refuses any existing tables.
The database user needs permission to create that database if it is missing.

Example with separately provisioned disposable services, using fictional credentials:

```powershell
$env:E2E_DATABASE_URL = 'postgresql://fielddesk:web_test_password@localhost:55432/fielddesk_web_test'
$env:E2E_REDIS_URL = 'redis://localhost:56379/0'
pnpm test:e2e
```

The runner generates database types, checks the target, applies migrations, seeds
demo accounts, builds API/web and starts owned servers at localhost:3101/3100.
It never reuses an existing application server, resets a database or flushes Redis.
Chromium and WebKit run sequentially with separate API processes and rate-limit
namespaces; artifacts remain in `test-results/chromium` and `test-results/webkit`.
For a focused rerun against an already prepared isolated database, use
`pnpm --filter @fielddesk/web exec playwright test --project=chromium` (or `webkit`).
Every API run uses a unique Redis key prefix. Tests include an expiry fixture that
updates only the matching session in the dedicated test database. Recreate your
disposable PostgreSQL service before another complete preparation run; no automatic
data deletion is provided. CI provisions independent service data for each job.

Tests cover real login/logout, refresh, revoked/expired sessions, account changes,
cross-tab logout, delayed identity, CSRF recovery and theme/mobile/keyboard behaviour.
429 and 503 presentation uses controlled browser responses. Screenshots and failure
traces are stored in ignored `test-results`; CI uploads results on failure.

The suite also checks delayed focus/reconnect form stability, password/caret
behaviour, duplicate-submit protection, toast counts, 320/390/tablet/desktop and
short-height layouts, 200% text sizing, and axe WCAG AA rules in both themes.
A Chromium-only CDP profile records task/script/layout/style time for typing,
visibility, theme and session checks, and checks static branding DOM stability.
WebKit runs all functional checks; its CDP-only profile is explicitly skipped.

Physical iOS Safari and Android Chrome acceptance is still required for native
keyboard opening/closing, autofill and rotation. Desktop browser emulation and
WebKit automation do not establish native keyboard behaviour.

Local verification on 7 October 2026: frozen installation, formatting, lint,
type checks and production builds passed; 29 frontend tests and 27 real backend/
database integration tests passed. Browser runs passed 23 Chromium scenarios and
22 WebKit scenarios, with only the CDP-specific profile skipped in WebKit. Axe
scans passed across six viewport sizes in both themes, including short landscape;
200% text sizing passed. Login and shell screenshots were inspected. Physical
device keyboard acceptance remains unverified; no remote CI run is claimed.

Browser tests rebuild the web app with the test API origin. Run `pnpm build` again
before starting the normal production build against your configured development API.

Auth standards refactor verified on 7 October 2026: all 29 focused tests passed
before and after extraction; formatting, zero-warning lint, type checks and
production build passed. Isolated browser runs passed 23 Chromium and 22 WebKit
scenarios, with the Chromium-only profile skipped in WebKit. Windows test-server
teardown stalled after each browser's scenarios and required stopping the verified
test-server processes; both runs then reported success. Disposable PostgreSQL/Redis
containers were removed and the web build restored to its normal configured API.
No additional physical-device verification was performed for this refactor.
