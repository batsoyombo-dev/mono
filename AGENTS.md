# AGENTS.md

Bun + Turborepo backend: an Elysia HTTP API (`apps/api`) with Better Auth, a BullMQ worker (`apps/mq-worker`) that also runs cron jobs, Prisma on PostgreSQL, and shared `@mono/*` packages. This file is the contract for working in the repo. When code and this file disagree, follow the reference implementations and fix this file.

Reference implementations to copy: `packages/services/src/modules/user`, `apps/api/src/controllers/user.controller.ts`, `apps/api/tests/app.test.ts`.

## Rules

1. Business logic lives in `@mono/services` modules. Controllers only parse the request, resolve the session and call a service.
2. Service modules never touch Prisma directly. They call repositories in `packages/services/src/repositories`.
3. Services validate their own input with the module's zod schema (`schema.parse(payload)`), even when the controller already validated it. Workers and seeds call services too.
4. Throw `AppError` subclasses from `@mono/error-handling` (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `InternalServerError`). Never build error responses by hand. Ownership checks (`ForbiddenError`) belong in the service handler.
5. Log with `logger` from `@mono/logger` and a metadata object: `logger.error("Payment failed", { error, orderId })`. Never use `console`.
6. Read environment only through `config` from `@mono/global-config`. To add a variable, add it to `packages/global-config/src/index.ts` and `.env.example`. Wrap optional integrations in `optional(...)` so an empty value disables them. Never read `process.env` anywhere else.
7. Respect the dependency rules below. They are enforced by ESLint. To allow a new edge, change `packages/eslint-config/boundaries.js` deliberately; never add `eslint-disable` for `no-restricted-imports`.
8. Never edit generated or vendored output: `packages/database/generated/`, `dist/`, `bun.lock` (let `bun install` write it).
9. Every schema change ships with a migration (`bun run db:migrate -- --name <name>`). Never edit an applied migration.

## Done means

```sh
bun run format:fix
bun run verify      # format check, check-types, lint, test (CI also runs build)
```

Add or update tests for behavior you change. API tests use fakes and need no database, Redis or `.env`. Keep them that way.

## How a request flows

```
HTTP request
  -> apps/api/src/controllers/<name>.controller.ts   validate body (zod), resolve session -> actorUserId
  -> @mono/services <name>Service.<operation>(input)  re-validate, authorize, business rules
  -> packages/services/src/repositories/*             Prisma queries (BaseRepository)
  -> @mono/database prisma client                     PostgreSQL
Errors: throw AppError subclasses -> apps/api/src/plugins/error-response.plugin.ts -> envelope
```

Background work enqueues a job with `defaultQueue.add(...)`. `apps/mq-worker` runs the job handler, which calls the same services.

Every API response uses one envelope, built by `apps/api/src/utils/response.ts` (`success(...)`):

```json
{ "success": true, "status": 200, "data": { ... } }
{ "success": false, "status": 422, "error": { "message": "Validation failed", "issues": [...] } }
```

## Dependency rules

Source of truth: `packages/eslint-config/boundaries.js`. Arrows point to what a workspace may import.

| Workspace              | May import (`@mono/...`)                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `global-config`        | nothing                                                                                    |
| `utils`                | nothing (framework-free helpers)                                                           |
| `logger`               | `global-config/runtime` only                                                               |
| `error-handling`       | `logger`                                                                                   |
| `database`             | `global-config`                                                                            |
| `cache`                | `global-config`, `logger`                                                                  |
| `services`             | `cache`, `database`, `error-handling`, `global-config`, `logger`, `utils`                  |
| `services/src/modules` | same, minus `database` (use repositories; `auth/better-auth.ts` is the exception)          |
| `mq-worker`            | `cache`, `error-handling`, `global-config`, `logger`, `services`, `utils`                  |
| `api` entry and seeds  | everything above                                                                           |
| `api` request layer    | `error-handling`, `logger`, `utils`, `services/<module>/schema`, `services/<module>/types` |

The API request layer is `src/app.ts`, `src/controllers`, `src/plugins`, `src/utils` and `tests`. It receives real services and config through `createApp(...)` in `apps/api/src/index.ts`, which is why API tests run without a database or `.env`.

`@mono/global-config` throws on import when the environment is invalid. `@mono/global-config/runtime` (`NODE_ENV`, `LOG_LEVEL`, never throws) exists only for the logger.

## Recipes

### Feature module (CRUD resource)

1. `packages/database/prisma/schema.prisma`: add the model, then `bun run db:migrate -- --name <name>` (needs `bun run infra:up`).
2. `packages/services/src/repositories/<name>.repository.ts`: `class XRepository extends BaseRepository<typeof prisma.x>`, export a singleton, re-export it from `repositories/index.ts`. Pass `{ softDelete: true }` when the model has a nullable `deletedAt`.
3. `packages/services/src/modules/<name>/`:
    - `schema.ts`: zod input schemas.
    - `types.ts`: `z.infer` payloads, `*Input` types (payload + `actorUserId`), response types, and a `<Name>Operations` type listing the service functions.
    - `handler.ts`: the functions, exported as `export const <name>Service: <Name>Operations = { ... }`.
    - `index.ts`: re-exports `handler`, `schema`, `types`. Add the module to `modules/index.ts`.
4. `apps/api/src/controllers/<name>.controller.ts`: `create<Name>Controller({ auth, <name> })` returns an `Elysia` instance. Use `getAuthorizedSessionUserId(auth, request)` for protected routes and `{ body: <schema> }` for validation. Wrap results in `success(...)`.
5. Wire it: add the dependency to `ApiDependencies` and `createApi` in `apps/api/src/controllers/index.ts`, and pass the real service in `apps/api/src/index.ts`.
6. Test it in `apps/api/tests` with `createApp({ ..., <name>: fakeService })` and `app.handle(new Request(...))`. Put pure service logic tests in `packages/services/tests`.

### Background job

1. Add a zod schema to `packages/services/src/queues/default/schemas.ts` and register its type in `DefaultQueueJobs`.
2. Add a handler in `apps/mq-worker/src/jobs/` and register it in `apps/mq-worker/src/initialize.ts`. This is type-checked: every job name must have a handler.
3. Enqueue with `defaultQueue.add("<job>", data)`.

New queue: add its name to `QueueNameSchema`, create a `TypedQueue`, add it to `QueueMap`, the worker's `queues` map and `schedules`. Each worker process runs one queue (`--queue <name>`).

### Cron job

Add an entry to `apps/mq-worker/src/schedules.ts`. Schedules are BullMQ job schedulers stored in Redis, so several workers never double-fire. Entries removed from the file are removed from Redis on the next worker start.

### Cache and locks

`cache` from `@mono/cache` (ioredis): `get`, `set`, `remember(key, ttlMs, fetcher)`, `forget`, `withLock(key, ttlMs, fn)`. Build keys with `ck("users", { page }, "v1")`.

### Auth

Better Auth is mounted at `/api/v1/auth/*` (email/password with email verification; Google when `GOOGLE_CLIENT_*` are set). For another isolated surface, such as an admin panel with sign-up disabled, call `createAuth({ basePath, cookiePrefix, disableSignUp })` again and mount it under its own prefix.

### Email

Use `mailClient` from `@mono/services`. Templates are Handlebars files in `packages/services/src/clients/mail/templates`. Locally, mail lands in Mailpit at http://localhost:8025.

## Environment

- Local infrastructure: `bun run infra:up` (PostgreSQL 18, Redis 8, Mailpit). Apps run on the host: `bun run dev`.
- All apps read the root `.env` (copy `.env.example`). `bun run seed` creates `demo@example.com` / `password123`.
- Turbo runs `prisma generate` before `check-types`, `lint`, `build` and `dev`. Run `bun run db:generate` yourself only when calling `tsc` directly.
- Bun is pinned in `package.json` (`packageManager`). Use `bun`, never `npm`, `yarn` or `pnpm`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.

<!-- END:turborepo-agent-rules -->
