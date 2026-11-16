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
            "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
            // AGENTS.md rule 5: log through @mono/logger.
            "no-console": "error",
            // AGENTS.md rule 6: packages read `env.<group>` from @mono/env, apps their src/config.ts.
            // @mono/env itself and Prisma's CLI config are the only exceptions (see their configs).
            "no-restricted-properties": [
                "error",
                {
                    object: "process",
                    property: "env",
                    message:
                        "Read env through @mono/env (`env.<group>` in packages, src/config.ts in apps). See rule 6 in AGENTS.md.",
                },
                {
                    object: "Bun",
                    property: "env",
                    message:
                        "Read env through @mono/env (`env.<group>` in packages, src/config.ts in apps). See rule 6 in AGENTS.md.",
                },
            ],
        },
    },
    // Type-aware rules for async correctness. An unhandled rejection crashes the process (see
    // @mono/error-handling), so a forgotten `await` is a production bug, not a style issue.
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: process.cwd(),
            },
        },
        rules: {
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/only-throw-error": "error",
            "@typescript-eslint/return-await": ["error", "in-try-catch"],
            "@typescript-eslint/switch-exhaustiveness-check": [
                "error",
                { considerDefaultExhaustiveForUnions: true },
            ],
        },
    },
    {
        // bun:test types `expect(...).rejects/resolves` matchers as non-promises, but they must
        // be awaited; await-thenable would flag every one.
        files: ["tests/**/*.ts", "**/*.test.ts"],
        rules: { "@typescript-eslint/await-thenable": "off" },
    },
    {
        ignores: ["dist/**", "generated/**", ".turbo/**"],
    },
];
