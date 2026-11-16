import globals from "globals";

import { config } from "./base.js";

/**
 * ESLint configuration for Bun runtime apps and packages.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const nodeConfig = [
    ...config,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                Bun: "readonly",
            },
        },
    },
];
