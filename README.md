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

Outgoing email lands in Mailpit at http://localhost:8025. The queue dashboard is at http://localhost:3000/admin/queues (admins only, see AGENTS.md).

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
  env/                typed env: shared variable groups (env.<group>) + defineEnv for apps
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
| `bun run verify`                            | Format check, types, lint and tests      |
| `bun run db:migrate -- --name <name>`       | Create and apply a development migration |
| `bun run db:deploy`                         | Apply pending migrations                 |
| `bun run db:studio`                         | Open Prisma Studio                       |
| `bun run seed`                              | Run the API seeders                      |
| `bun run queue help`                        | Inspect and trigger queue jobs (CLI)     |
| `bun run infra:up` / `bun run infra:down`   | Start or stop local infrastructure       |

Every app reads the single root `.env` (`bun --env-file=../../.env`). In production, set real environment variables instead.

## Working in this repo

This repo is set up for AI coding agents. [AGENTS.md](AGENTS.md) is the contract: architecture, the rules that ESLint enforces, recipes for modules, jobs and cron, and what "done" means. `CLAUDE.md` imports it. Read it before adding code, whether you are a person or an agent.

## Deployment

```sh
bun install --frozen-lockfile
bun run build
bun run db:deploy
bun run start:api
bun run start:mq-worker
```

The API and the worker are separate long-running processes. Both handle `SIGTERM` gracefully. The worker build copies the email templates from `packages/services/src/clients/mail/templates` into `dist/templates`.
