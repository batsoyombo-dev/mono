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
    {
        ignores: ["dist/**", "generated/**", ".turbo/**"],
    },
];
