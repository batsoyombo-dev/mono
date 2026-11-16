# CLAUDE.md

Bun + Turborepo backend starter. Read README.md "Conventions" before adding code; `packages/services/src/modules/user` and `apps/api/src/controllers/user.controller.ts` are the reference implementations.

- Business logic lives in `@mono/services` modules (`schema.ts` / `types.ts` / `handler.ts` exporting a `*Service: *Operations`). Controllers only parse the request, resolve the session, and call the service.
- Controllers import from `@mono/services/<module>/schema` and `/types` subpaths, never the package root, so API tests run without a database.
- Throw `@mono/error-handling` errors; never build error responses by hand.
- Use `logger` from `@mono/logger` with a metadata object (`logger.error("msg", { error })`), never `console`.
- Env vars: add them to `@mono/global-config` and `.env.example`; never read `process.env` elsewhere.
- Before finishing: `bun run check-types && bun run lint && bun run test && bun run format`.
