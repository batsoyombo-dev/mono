# `@mono/eslint-config`

Shared flat ESLint configs.

- `@mono/eslint-config/base`: TypeScript + Prettier compatible rules.
- `@mono/eslint-config/node`: `base` plus Node/Bun globals. Use it for apps and packages.
- `@mono/eslint-config/boundaries`: `boundaries("<workspace>")` enforces which `@mono/*` packages a workspace may import. The map in `boundaries.js` is the source of truth for the dependency rules in `AGENTS.md`.
