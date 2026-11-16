import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

const ENV_MESSAGE =
    "Read env through @mono/env (`env.<group>` in packages, src/config.ts in apps). See rule 6 in AGENTS.md.";

/**
 * `no-restricted-syntax` entries that close the ways around `no-restricted-properties`
 * (`process.env`, `Bun.env`). Exported so configs that set `no-restricted-syntax` themselves
 * (entrypoints.js) keep them: a later config replaces a rule's options instead of merging.
 */
export const envAccessSyntax = [
    // import { env } from "node:process" / "process"
    {
        selector:
            "ImportDeclaration[source.value=/^(node:)?process$/] > ImportSpecifier[imported.name='env']",
        message: ENV_MESSAGE,
    },
    // import * as proc from "node:process"; import proc from "process" (then proc.env)
    {
        selector:
            "ImportDeclaration[source.value=/^(node:)?process$/] > :matches(ImportNamespaceSpecifier, ImportDefaultSpecifier[local.name!='process'])",
        message: `Import \`process\` under its own name (or use the global) so env reads stay visible to lint. ${ENV_MESSAGE}`,
    },
    // import.meta.env
    {
        selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
        message: ENV_MESSAGE,
    },
    // globalThis.process.env, global.process["env"], globalThis.Bun.env
    {
        selector:
            "MemberExpression[object.type='MemberExpression'][object.object.name=/^(globalThis|global|self|window)$/][object.property.name=/^(process|Bun)$/]:matches([property.name='env'], [property.value='env'])",
        message: ENV_MESSAGE,
    },
    // const { env } = globalThis.process
    {
        selector:
            "VariableDeclarator[init.type='MemberExpression'][init.object.name=/^(globalThis|global|self|window)$/][init.property.name=/^(process|Bun)$/] > ObjectPattern > Property[key.name='env']",
        message: ENV_MESSAGE,
    },
];

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
            // @mono/env itself and Prisma's CLI config are the only exceptions (ENV_READERS in
            // boundaries.js).
            "no-restricted-properties": [
                "error",
                { object: "process", property: "env", message: ENV_MESSAGE },
                { object: "Bun", property: "env", message: ENV_MESSAGE },
            ],
            "no-restricted-syntax": ["error", ...envAccessSyntax],
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
