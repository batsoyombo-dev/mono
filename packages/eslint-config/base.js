import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * Shared ESLint configuration for every package.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    eslintConfigPrettier,
    {
        plugins: {
            turbo: turboPlugin,
        },
        rules: {
            "turbo/no-undeclared-env-vars": "off",
        },
    },
    {
        files: ["**/*.{ts,tsx}"],
        rules: {
            "no-undef": "off",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
        },
    },
    {
        ignores: ["dist/**", "generated/**", ".turbo/**"],
    },
];
