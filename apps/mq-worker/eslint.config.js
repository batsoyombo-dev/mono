import { boundaries } from "@mono/eslint-config/boundaries";
import { configFirst } from "@mono/eslint-config/entrypoints";
import { nodeConfig } from "@mono/eslint-config/node";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...nodeConfig,
    ...boundaries("mq-worker"),
    ...configFirst(["src/index.ts", "src/cli.ts"]),
];
