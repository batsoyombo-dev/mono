# `@mono/eslint-config`

Shared flat ESLint configs.

- `@mono/eslint-config/base`: TypeScript + Prettier compatible rules, plus type-aware async rules (`no-floating-promises`, `no-misused-promises`, ...) through the TypeScript project service. Every linted `.ts` file must be in its package's `tsconfig.json` `include`.
- `@mono/eslint-config/node`: `base` plus Node/Bun globals. Use it for apps and packages.
- `@mono/eslint-config/boundaries`: `boundaries("<workspace>")` enforces which `@mono/*` packages a workspace may import, through the local `mono/boundaries` rule (`plugin.js`). It checks static imports, `export ... from`, dynamic `import("...")` and `require("...")`, rejects relative imports that resolve outside the file's workspace, and keeps the API request layer's relative imports inside the request layer (an allowlist: `src/app.ts`, `src/controllers`, `src/plugins`, `src/utils`, `tests`). The map in `boundaries.js` is the source of truth for the dependency rules in `AGENTS.md`. It also lists the files allowed to read the environment directly (`ENV_READERS`).
- Env access (`base`): `process.env` and `Bun.env` (`no-restricted-properties`), plus `import { env } from "node:process"`, `import { env } from "bun"`, `import.meta.env`, `globalThis.process.env` / `globalThis["process"].env`, `Reflect.get(process, "env")` and aliasing `process`/`Bun` (`no-restricted-syntax`, entries in `envAccessSyntax`). Deliberate evasion (casts, computed dynamic `import()`) is not caught; review catches that.
- `@mono/eslint-config/entrypoints`: `configFirst([...])` makes app entry points import `./config` first.

Lint runs with `--max-warnings=0`: a warning fails like an error.
