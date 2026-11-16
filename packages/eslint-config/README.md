# `@mono/eslint-config`

Shared flat ESLint configs.

- `@mono/eslint-config/base`: TypeScript + Prettier compatible rules, plus type-aware async rules (`no-floating-promises`, `no-misused-promises`, ...) through the TypeScript project service. Every linted `.ts` file must be in its package's `tsconfig.json` `include`.
- `@mono/eslint-config/node`: `base` plus Node/Bun globals. Use it for apps and packages.
- `@mono/eslint-config/boundaries`: `boundaries("<workspace>")` enforces which `@mono/*` packages a workspace may import. The map in `boundaries.js` is the source of truth for the dependency rules in `AGENTS.md`.
- `@mono/eslint-config/entrypoints`: `configFirst([...])` makes app entry points import `./config` first.

Lint runs with `--max-warnings=0`: a warning fails like an error.
