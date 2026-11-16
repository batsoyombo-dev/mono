import { boundaries } from "@mono/eslint-config/boundaries";
import { nodeConfig } from "@mono/eslint-config/node";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...nodeConfig,
    ...boundaries("env"),
    // The one package that reads process.env; everything else goes through it.
    { files: ["src/**/*.ts"], rules: { "no-restricted-properties": "off" } },
];
