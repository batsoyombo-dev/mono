# AGENTS.md

Bun + Turborepo backend: an Elysia HTTP API (`apps/api`) with Better Auth, a BullMQ worker (`apps/mq-worker`) that also runs cron jobs, Prisma on PostgreSQL, and shared `@mono/*` packages. This file is the contract for working in the repo. When code and this file disagree, follow the reference implementations and fix this file.

Reference implementations to copy:

- **CRUD resource with ownership, lists and soft delete:** `packages/services/src/modules/notes`, `packages/services/src/repositories/note.repository.ts`, `apps/api/src/controllers/note.controller.ts`, tests in `packages/services/tests/note-service.test.ts`, `packages/services/tests/integration/note.integration.test.ts` and `apps/api/tests/notes.test.ts`. Notes is an example resource: copy its shape, and delete it (model, migration, module, controller, tests) once the project has real resources.
- **Smallest module:** `packages/services/src/modules/user` with `apps/api/src/controllers/user.controller.ts`.

## Rules

1. Business logic lives in `@mono/services` modules. Controllers only parse the request, resolve the session and call a service.
2. Service modules never touch Prisma directly. They call repositories in `packages/services/src/repositories`.
3. Services validate their own input with the module's zod schema (`schema.parse(payload)`), even when the controller already validated it. Workers and seeds call services too. A failed `parse` becomes a 422 automatically.
4. Throw `AppError` subclasses from `@mono/error-handling` (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `InternalServerError`). Never build error responses by hand. Ownership checks (load, `NotFoundError` if missing, `ForbiddenError` if not the actor's) belong in the service. `toAppError` maps everything else at the edges: zod errors to 422, Prisma P2002 to 409, P2025 to 404, P2003 to 400, and anything unknown to a generic 500 whose message is logged, never sent.
5. Log with `logger` from `@mono/logger` and a metadata object: `logger.error("Payment failed", { error, orderId })`. Never use `console` (ESLint `no-console`).
6. Read environment only through `@mono/env`: packages use `env.<group>.<VAR>`, apps use their own `src/config.ts`. See "Configuration" below. Never read `process.env` or `Bun.env` anywhere else (ESLint `no-restricted-properties`; only `packages/env` and `packages/database/prisma.config.ts` are exempt).
7. Respect the dependency rules below. They are enforced by ESLint. To allow a new edge, change `packages/eslint-config/boundaries.js` deliberately; never add `eslint-disable` for `no-restricted-imports`.
8. Never edit generated or vendored output: `packages/database/generated/`, `dist/`, `bun.lock` (let `bun install` write it).
9. Every schema change ships with a migration (`bun run db:migrate -- --name <name>`). Never edit an applied migration. CI runs `bun run db:check`, which fails when `schema.prisma` and the migrations disagree.
10. List endpoints go through `parseListRouteInput(input, { filterFields, sortFields })` from `@mono/services/filters` with explicit allowlists (both required). Filter ids are Prisma paths, so list only fields that are safe to expose; an open list would let callers query any column or relation.
11. Never leave a promise floating: `await` it, return it, or mark a deliberate fire-and-forget with `void`. ESLint enforces this (`no-floating-promises`, `no-misused-promises`), because an unhandled rejection shuts the process down (`@mono/error-handling`).
12. Import `@mono/services` by area, never from the package root (there is none): `@mono/services/<module>` (for example `/notes`, `/user`, `/auth`, `/queue`), `@mono/services/queues`, `/mail`, `/storage`, `/filters`, `/repositories`, `/lifecycle`. The API request layer may only import `@mono/services/<module>/schema` and `/types`.

## Done means

```sh
bun run format:fix
bun run verify             # format check, check-types, lint (type-aware, zero warnings), unit tests; CI also runs build

# When you touch the schema, repositories, queues or cache (needs `bun run infra:up`):
bun run db:deploy          # apply migrations to the local database
bun run db:check           # schema.prisma matches the migrations
bun run test:integration   # *.integration.test.ts against real PostgreSQL and Redis
```

Add or update tests for behavior you change:

- **Unit tests** (`*.test.ts`) pass fakes into factories (`create<Name>Service`, `createApp`, `createJobMap`, `createProcessor`) and need no database, Redis or `.env`. Keep them that way. `bun run test` runs with `--no-env-file`, so a test that accidentally loads a real instance fails locally exactly as it does in CI. Import factories from `service.ts`, never `handler.ts`, which builds the real instances. API tests build the app with `createTestApp(...)` from `apps/api/tests/helpers.ts`: every dependency is faked and any service a test did not fake rejects loudly.
- **Integration tests** (`*.integration.test.ts`, e.g. `packages/services/tests/integration/`) use real infrastructure. `bun run test` skips them; CI runs them in a separate job with fresh PostgreSQL and Redis. Use a unique prefix per run (emails, BullMQ `prefix`, cache `prefix`) and delete what you create in `afterAll`, so they are safe on a shared dev database.

## How a request flows

```
HTTP request
  -> apps/api/src/plugins/request-context.plugin.ts  x-request-id (reused or generated), one log line per request
  -> apps/api/src/controllers/<name>.controller.ts   validate body (zod), resolve session -> actorUserId
  -> @mono/services <name>Service.<operation>(input)  re-validate, authorize, business rules
  -> packages/services/src/repositories/*             Prisma queries (BaseRepository)
  -> @mono/database prisma client                     PostgreSQL
Errors: anything thrown -> toAppError (@mono/error-handling) -> error-response.plugin.ts -> envelope
```

Background work enqueues a job with `defaultQueue.add(...)`. `apps/mq-worker` runs the job handler, which calls the same services.

Every API response uses one envelope, built by `apps/api/src/utils/response.ts` (`success(...)`):

```json
{ "success": true, "status": 200, "data": { ... } }
{ "success": false, "status": 422, "error": { "message": "Validation failed", "issues": [{ "path": "title", "message": "..." }] } }
```

Other endpoints: `GET /health` (liveness, no dependencies), `GET /health/ready` (database, cache and queue Redis; 503 with per-check results when one fails), and OpenAPI docs at `/openapi` (JSON at `/openapi/json`), generated from the route schemas and on by default outside production (`API_DOCS`).

## Dependency rules

Source of truth: `packages/eslint-config/boundaries.js`. Arrows point to what a workspace may import.

| Workspace              | May import (`@mono/...`)                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `env`                  | nothing                                                                                    |
| `utils`                | nothing (framework-free helpers)                                                           |
| `logger`               | `env/runtime` only                                                                         |
| `error-handling`       | `logger`                                                                                   |
| `database`             | `env`                                                                                      |
| `cache`                | `env`, `logger`                                                                            |
| `services`             | `cache`, `database`, `env`, `error-handling`, `logger`, `utils`                            |
| `services/src/modules` | same, minus `database` (use repositories; `auth/better-auth.ts` is the exception)          |
| `mq-worker`            | `cache`, `env`, `error-handling`, `logger`, `services/<area>`, `utils`                     |
| `api` entry and seeds  | everything above                                                                           |
| `api` request layer    | `error-handling`, `logger`, `utils`, `services/<module>/schema`, `services/<module>/types` |

The API request layer is `src/app.ts`, `src/controllers`, `src/plugins`, `src/utils` and `tests`. Code that needs real infrastructure inside the API, such as the queue dashboard in `src/admin`, lives outside it and is passed to `createApp({ plugins })`. It receives real services and config through `createApp(...)` in `apps/api/src/index.ts`, which is why API tests run without a database or `.env`.

Importing `@mono/env` never throws: each `env.<group>` is validated on first read. `@mono/env/runtime` (`NODE_ENV`, `LOG_LEVEL`, lenient, never throws) exists only for the logger.

## Recipes

### Feature module (CRUD resource)

1. `packages/database/prisma/schema.prisma`: add the model, then `bun run db:migrate -- --name <name>` (needs `bun run infra:up`).
2. `packages/services/src/repositories/<name>.repository.ts`: `class XRepository extends BaseRepository<PrismaClient["x"]>` whose constructor takes a `PrismaClient`, plus `export const xRepository = new XRepository(prisma)`. Re-export it from `repositories/index.ts`. Pass `{ softDelete: true }` when the model has a nullable `deletedAt`: reads, counts, updates and deletes then skip deleted rows (updating one throws P2025, a 404). `upsert` is not soft-delete aware.
3. `packages/services/src/modules/<name>/`:
    - `schema.ts`: zod input schemas.
    - `types.ts`: `z.infer` payloads, `*Input` types (payload + `actorUserId`), response types, and a `<Name>Operations` type listing the service functions.
    - `service.ts`: `export function create<Name>Service(deps: <Name>ServiceDeps): <Name>Operations`. `deps` lists the repositories, queues and clients it uses, narrowed with `Pick<...>` so tests can fake them. Import only types here, so tests load it without a `.env`.
    - `handler.ts`: the instance apps use, `export const <name>Service = create<Name>Service({ <repo>: <name>Repository })`.
    - `index.ts`: re-exports `handler`, `schema`, `service`, `types`. The module is then importable as `@mono/services/<name>` (and `/<name>/schema`, `/<name>/types`) through the package's `exports` wildcard; there is no barrel to update.
4. `apps/api/src/controllers/<name>.controller.ts`: `create<Name>Controller({ auth, <name> })` returns an `Elysia` instance. Resolve the actor with `.derive(... getAuthorizedSessionUserId(auth, request))` so unauthenticated calls get 401 before validation, and validate with `{ body, params, query }` schemas. Wrap results in `success(...)` (`success(data, 201)` for creates).
5. Wire it: add the dependency to `ApiDependencies` and `createApi` in `apps/api/src/controllers/index.ts`, pass the real service in `apps/api/src/index.ts`, and add a fake to `createTestApp` in `apps/api/tests/helpers.ts`. Every dependency is required, so a missing wire is a type error.
6. Test the service in `packages/services/tests` with `create<Name>Service({ <repo>: fakeRepo })` imported from `service.ts`, the routes in `apps/api/tests` with `createTestApp({ <name>: fakeService })` and `app.handle(new Request(...))`, and the repository plus service against PostgreSQL in `packages/services/tests/integration/<name>.integration.test.ts`.

### Background job

1. Add a zod schema to `packages/services/src/queues/default/schemas.ts` and register it in `defaultQueueJobSchemas` (`queues/default/jobs.ts`). The payload type is derived from the schema.
2. Add a handler in `apps/mq-worker/src/jobs/` (`JobDef<Payload>`, or `create<Name>Job(deps)` when it uses a client) and register it in `createJobMap` (`apps/mq-worker/src/job-map.ts`); pass real clients in `src/initialize.ts`. This is type-checked: every job name must have a handler. Use `job.log(...)` for lines that should appear in the dashboard's Logs tab.
3. Enqueue with `defaultQueue.add("<job>", data)` (`@mono/services/queues`). `add` validates the payload and throws `ValidationError` before anything reaches Redis; the worker re-validates and fails bad payloads immediately with no retries (`UnrecoverableError`). Handlers receive the **parsed** payload (schema defaults and transforms applied).

Retries (`apps/mq-worker/src/processor.ts`): a handler error that maps to a 4xx (`ValidationError`, zod errors, `NotFoundError`, `ForbiddenError`, ...) fails the job without retrying; 409 `ConflictError` and anything else (network, SMTP, crashes) is retried. Defaults: 3 attempts with exponential backoff; completed jobs are kept 7 days (max 1000), failed jobs 30 days (max 5000). `WORKER_CONCURRENCY` sets parallel jobs per process; `WORKER_HEALTH_PORT` serves `GET /health` for liveness probes.

New queue: add its name to `QueueNameSchema` (`queues/names.ts`), add its schemas to `queueJobSchemas` and `QueueMap` (`queues/jobs.ts`), add a `create<Name>Queue` factory, add it to `createQueues` (`queues/registry.ts`) and give it an entry in `schedules`. Each worker process runs one queue (`--queue <name>`).

### Cron job

Add an entry to `schedules` in `packages/services/src/queues/schedules.ts`. Schedules are BullMQ job schedulers stored in Redis (id `cron-<id>`), synced by the worker on start, so several workers never double-fire. Entries removed from the file are removed from Redis on the next worker start; the sync only touches `cron-` schedulers, so schedulers your code creates at runtime with other ids (per-user reminders, for example) are safe. Run one immediately with `bun run queue trigger <queue> <id>`.

### Operating queues

Three ways to inspect and act on queues. All three call `queueService` (`packages/services/src/modules/queue`), and every action is audit-logged.

- **CLI** (no auth; needs `.env` and Redis). Prints JSON to stdout, logs to stderr, exit code 1 on failure. `bun run queue help` lists everything.

    ```sh
    bun run queue stats                                  # counts, paused, schedules + next run
    bun run queue jobs default --status failed           # recent jobs, newest first
    bun run queue job default <jobId>                    # payload, error, stacktrace, logs
    bun run queue trigger default health-check           # run a cron schedule now
    bun run queue add default health '{"pong":"hi"}' --delay 10s --job-id once
    bun run queue retry default <jobId>                  # also: retry-failed, promote, remove
    bun run queue pause default                          # also: resume
    bun run queue clean default --status completed --older-than 1d
    ```

- **Admin HTTP API** under `/api/v1/admin/queues` (`apps/api/src/controllers/queue.controller.ts`): `GET /`, `GET /:queue/jobs?status=&page=&pageSize=`, `GET /:queue/jobs/:jobId`, `POST /:queue/jobs`, `POST /:queue/schedules/:scheduleId/trigger`, `POST /:queue/jobs/:jobId/retry|promote`, `DELETE /:queue/jobs/:jobId`, `POST /:queue/retry-failed|pause|resume|clean`.
- **Dashboard** (Bull Board) at `/admin/queues`: recent jobs by status with payload, logs, errors, retry and clean. Mounted in `apps/api/src/admin/queue-dashboard.ts`; the UI itself comes from `@bull-board/ui`, so there is no frontend code to maintain.

The API and dashboard need a Better Auth session cookie for a verified user whose email is in `ADMIN_EMAILS` (comma-separated; `.env.example` makes `demo@example.com` an admin). No session gives 401, a non-admin gives 403. To use the dashboard locally, sign in from the API origin first, for example by running `fetch("/api/v1/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "demo@example.com", password: "password123" }) })` in the browser console on `http://localhost:3000/health`.

### Configuration

Every shared variable is declared once, in a named group in `packages/env/src/groups.ts` (`runtime`, `app`, `database`, `redis`, `auth`, `mail`, `storage`). Packages read it typed; apps validate it at startup.

```ts
// Package: a factory that takes options, plus the instance apps import, built from env.
export function createMailClient(options: MailClientOptions) { ... }
export const mailClient = createMailClient({ smtp: { host: env.mail.MAIL_HOST, ... }, ... });

// App (apps/<app>/src/config.ts): every group plus app-only variables, one error for all.
export const config = defineEnv("api", { extend: { SERVER_PORT: port.default(3000) } });
```

- **Factory plus instance.** Each client or service has a `create<Name>(options)` factory and an exported instance built from `env`. Examples: `prisma` and `createDatabase`, `cache` and `RedisCache`, `queues` and `createQueues`, `mailClient` and `createMailClient`, `storage` and `createStorage` (`null` when unset), `auth` and `createAuth`, `userService` and `createUserService`. Apps import the instance; tests and special cases (a second database, an admin auth surface) call the factory.
- **Adding a variable:**
    - When a package reads it, add it to the right group in `groups.ts` (or add a new group) and to `.env.example`. The types of `env.<group>` and of each app's `config` follow.
    - When only one app reads it (`SERVER_PORT`, `ADMIN_EMAILS`), put it in that app's `extend` and in `.env.example`.
- **Entry points** (`src/index.ts`, `src/seed.ts`, `src/cli.ts`) import `./config` **first** (enforced by `configFirst` in `packages/eslint-config/entrypoints.js`; add new entry points to the app's `eslint.config.js`), so a bad `.env` fails before any package loads and lists every problem at once. `defineEnv` validates all groups by default; pass `groups: [...]` for an app that needs fewer.
- **Helpers:** `optional(...)` for integrations an empty value disables, `commaSeparated(item)` for lists, `port` for ports.

### Cache and locks

`cache` from `@mono/cache` (ioredis; `new RedisCache({ url, prefix })` for another instance, `cache.namespace("x:")` for a prefixed view on the same connection): `get`, `set`, `remember(key, ttlMs, fetcher)`, `forget`, `withLock(key, ttlMs, fn)`, `consumeRateLimit(key, { windowMs, max })`, `ping`. Build keys with `ck("users", { page }, "v1")`.

- Values round-trip with `Date` and `BigInt` intact, so cached Prisma rows keep their types.
- `remember` shares one fetch between concurrent misses in a process; `null`/`undefined` results are not cached. Across processes, wrap the fetch in `withLock` if a stampede matters.
- The cache uses `CACHE_REDIS_URL` when set (a Redis that may evict), otherwise `REDIS_URL`. BullMQ always uses `REDIS_URL`, which must run `maxmemory-policy noeviction` (docker-compose sets it); an evicting Redis silently drops jobs.

### Auth

Better Auth is mounted at `/api/v1/auth/*` (email/password with email verification; Google when `GOOGLE_CLIENT_*` are set). For another isolated surface, such as an admin panel with sign-up disabled, call `createAuth({ basePath, cookiePrefix, disableSignUp })` again and mount it under its own prefix.

- Sessions are cached in a signed cookie for 5 minutes (`session.cookieCache`), so most requests skip the sessions query. A revoked session keeps working for up to 5 minutes; lower `maxAge` if that matters.
- Rate limiting (on in production) counts in Redis through `cache.consumeRateLimit`, so the limit holds across API instances. Behind a proxy, make sure it sets `X-Forwarded-For`.

### Email

Use `mailClient` from `@mono/services/mail`; outside the worker, prefer queueing a `mail` job. Templates are Handlebars files in `packages/services/src/clients/mail/templates`. Locally, mail lands in Mailpit at http://localhost:8025.

## Environment

- Local infrastructure: `bun run infra:up` (PostgreSQL 18, Redis 8, Mailpit). Apps run on the host: `bun run dev`. If `localhost:5432` or `:6379` reaches a different PostgreSQL or Redis already running on the machine (for example from Homebrew), connections fail with errors like `role "postgres" does not exist` or `P1010: User was denied access`. Set `POSTGRES_PORT` / `REDIS_PORT` (and `MAILPIT_*_PORT`) in `.env` to free ports, use the same ports in `DATABASE_URL` / `REDIS_URL` / `MAIL_PORT`, and run `bun run infra:up` again.
- All apps read the root `.env` (copy `.env.example`). `bun run seed` creates `demo@example.com` / `password123` and refuses to run with `NODE_ENV=production` (override with `--allow-production`).
- Every API response carries `x-request-id`; send one to correlate with an upstream service. Errors logged by the API include it.
- Turbo runs `prisma generate` before `check-types`, `lint`, `build` and `dev`. Run `bun run db:generate` yourself only when calling `tsc` directly.
- Bun is pinned in `package.json` (`packageManager`). Use `bun`, never `npm`, `yarn` or `pnpm`.
- `.claude/settings.json` pre-approves the routine commands above (verify, tests, lint, read-only git) for Claude Code and denies reading `.env` files. That is a guardrail against accidents, not a sandbox: keep real secrets out of local `.env` files.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.

<!-- END:turborepo-agent-rules -->
