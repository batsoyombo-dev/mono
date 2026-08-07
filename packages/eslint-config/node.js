import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import { config } from "./base.js";

/**
 * Elysia (Bun) ESLint configuration
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const elysiaConfig = [
    ...config,
    js.configs.recommended,
    eslintConfigPrettier,
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2022,
                ...globals.browser,
                Bun: "readonly",
            },
        },
    },
    {
        rules: {
            "no-console": "off",
            "no-process-exit": "off",

            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
        },
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "import/extensions": "off",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        ignores: ["dist/**", "build/**", ".bun/**"],
    },
];
