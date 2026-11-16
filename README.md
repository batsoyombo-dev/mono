# Mono

A Bun + Turborepo starter for backend projects: an Elysia HTTP API with Better Auth, a BullMQ worker that also runs cron jobs, Prisma on PostgreSQL, and a small set of shared packages.

## Quick start

```sh
bun install
cp .env.example .env        # defaults match docker-compose.yml
bun run infra:up            # PostgreSQL, Redis, Mailpit
bun run db:deploy           # apply migrations
bun run seed                # demo@example.com / password123
bun run dev                 # api on :3000 + mq-worker
```

Outgoing email lands in Mailpit at http://localhost:8025.

Requirements: Bun 1.4+, Docker (or your own PostgreSQL and Redis).

## Layout

```
apps/
  api/                Elysia HTTP API
    src/controllers/  route factories, one per resource
    src/plugins/      error -> response envelope mapping
    src/seeds/        idempotent seeders run by `bun run seed`
    tests/            app.handle() tests with fake services
  mq-worker/          BullMQ worker; src/schedules.ts holds the cron jobs
packages/
  services/           business logic: modules, repositories, queues, clients
  database/           Prisma schema, migrations, client
  global-config/      validated environment (zod)
  error-handling/     AppError hierarchy + process/shutdown handling
  logger/             winston (pretty in dev, JSON in production)
  cache/              Redis cache and distributed locks
  utils/              framework-free helpers and list/pagination schemas
  eslint-config/      shared flat ESLint configs
  typescript-config/  shared tsconfig
```

## Commands

| Command                                     | What it does                             |
| ------------------------------------------- | ---------------------------------------- |
| `bun run dev`                               | Run every app in watch mode              |
| `bun run dev:api` / `bun run dev:mq-worker` | Run one app                              |
| `bun run build`                             | Bundle apps into `apps/*/dist`           |
| `bun run check-types`                       | Type-check every package                 |
| `bun run lint` / `bun run lint:fix`         | ESLint                                   |
| `bun run format` / `bun run format:fix`     | Prettier                                 |
| `bun run test`                              | `bun test` across the repo               |
| `bun run db:migrate -- --name <name>`       | Create and apply a development migration |
| `bun run db:deploy`                         | Apply pending migrations                 |
| `bun run db:studio`                         | Open Prisma Studio                       |
| `bun run seed`                              | Run the API seeders                      |
| `bun run infra:up` / `bun run infra:down`   | Start or stop local infrastructure       |

Every app reads the single root `.env` (`bun --env-file=../../.env`). In production, set real environment variables instead.

## Conventions

### API responses

Every response uses one envelope, built by `apps/api/src/utils/response.ts`:

```json
{ "success": true, "status": 200, "data": { ... } }
{ "success": false, "status": 422, "error": { "message": "Validation failed", "issues": [...] } }
```

Throw `AppError` subclasses from `@mono/error-handling` (`NotFoundError`, `ForbiddenError`, `ConflictError`, ...). The error plugin maps them to the right status. Unknown errors become a logged 500.

### Adding a feature module

1. `packages/database/prisma/schema.prisma`: add the model, then run `bun run db:migrate -- --name <name>`.
2. `packages/services/src/repositories/<name>.repository.ts`: extend `BaseRepository` and export it from `repositories/index.ts`.
3. `packages/services/src/modules/<name>/`:
    - `schema.ts`: zod input schemas.
    - `types.ts`: `z.infer` payloads, `*Input` types (payload + `actorUserId`), response types, and a `<Name>Operations` type listing the service functions.
    - `handler.ts`: the functions, exported as `export const <name>Service: <Name>Operations = { ... }`.
    - `index.ts`: re-exports. Then add the module to `modules/index.ts`.
4. `apps/api/src/controllers/<name>.controller.ts`: `create<Name>Controller({ auth, <name> })` returns an `Elysia` instance. Import schemas and types from `@mono/services/<name>/schema` and `@mono/services/<name>/types` so controllers stay free of runtime service imports.
5. Wire it in `controllers/index.ts` (`ApiDependencies` + `createApi`) and pass the real service in `apps/api/src/index.ts`.
6. Test it in `apps/api/tests` with `createApp({ ..., <name>: fakeService })` and `app.handle(new Request(...))`. No database needed.

`src/modules/user` is the reference implementation.

### Background jobs

1. Add a zod schema to `packages/services/src/queues/default/schemas.ts` and register its type in `DefaultQueueJobs`.
2. Add a handler in `apps/mq-worker/src/jobs/` and register it in `apps/mq-worker/src/initialize.ts` (type-checked: every job name must have a handler).
3. Enqueue it with `defaultQueue.add("<job>", data)`.

For a new queue, add its name to `QueueNameSchema`, create a `TypedQueue`, and add it to `QueueMap`, the worker's `queues` map, and `schedules`. Run one worker process per queue with `--queue <name>`.

### Cron jobs

Add an entry to `apps/mq-worker/src/schedules.ts`. Schedules are BullMQ job schedulers stored in Redis, so running several worker instances never double-fires a tick. Schedules removed from the file are removed from Redis on the next worker start.

### Auth

Better Auth is mounted at `/api/v1/auth/*` (email/password with email verification, and Google when `GOOGLE_CLIENT_*` are set). Protected controllers call `getAuthorizedSessionUserId(auth, request)`. To add another isolated surface, such as an admin panel with sign-up disabled, call `createAuth({ basePath, cookiePrefix, disableSignUp })` again and mount it under its own prefix.

### Configuration

Add new environment variables to `packages/global-config/src/index.ts` and `.env.example`. Wrap optional integrations in `optional(...)` so an empty value disables them instead of failing boot.

## Deployment

```sh
bun install --frozen-lockfile
bun run build
bun run db:deploy
bun run start:api
bun run start:mq-worker
```

The API and the worker are separate long-running processes. Both handle `SIGTERM` gracefully. The worker build copies the email templates from `packages/services/src/clients/mail/templates` into `dist/templates`.
