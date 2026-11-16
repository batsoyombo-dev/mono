import { boundaries } from "@mono/eslint-config/boundaries";
import { nodeConfig } from "@mono/eslint-config/node";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...nodeConfig,
    ...boundaries("database"),
    // Loaded by the Prisma CLI on its own, outside any app, so it reads DATABASE_URL directly.
    { files: ["prisma.config.ts"], rules: { "no-restricted-properties": "off" } },
];
