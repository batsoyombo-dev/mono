# Hippocards Global

Bun and Turborepo monorepo for an HTTP API, queue worker, scheduler, and shared services.

## Prerequisites

- Bun 1.3.4
- PostgreSQL
- Redis

## Setup

```sh
bun install
cp .env.example .env
bun run db:deploy
```

Set every placeholder in `.env` before starting a service. Environment files are not committed.

## Commands

```sh
bun run dev
bun run build
bun run check-types
bun run lint
bun run test
bun run format
bun run db:generate
bun run db:deploy
```

Use `lint:fix` and `format:fix` only when you intend to modify files.
Create a development migration with `bun run db:migrate -- --name <migration-name>`.

## Services

- `api`: native Node HTTP API with `GET /health`.
- `mq-worker`: BullMQ worker. Start a queue with `bun run dev --filter=mq-worker -- --queue default`.
- `scheduler`: cron scheduler, including due notification processing.

## Deployment

Build with `bun run build`, deploy migrations with `bun run db:deploy`, then run each application with its `start` script. The worker and scheduler are separate long-running processes.

Email templates live in `packages/services/src/clients/mail/templates`; worker and scheduler builds copy them into their runtime artifacts. Template names may contain only letters, numbers, underscores, and hyphens.
