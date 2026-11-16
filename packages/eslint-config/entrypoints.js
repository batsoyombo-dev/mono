import { envAccessSyntax } from "./base.js";

/**
 * App entry points must import `./config` before anything else. It validates the whole
 * environment and reports every bad variable at once, before any package reads `env`.
 * Editors that sort imports can silently move it; this rule catches that.
 *
 * @param {string[]} files Entry point globs, relative to the app.
 * @returns {import("eslint").Linter.Config[]}
 */
export function configFirst(files) {
    return [
        {
            files,
            rules: {
                // Replaces base.js's options for these files, so repeat its env-access entries.
                "no-restricted-syntax": [
                    "error",
                    ...envAccessSyntax,
                    {
                        selector:
                            'Program > :first-child:not(ImportDeclaration[source.value="./config"])',
                        message:
                            'Entry points must start with `import ... from "./config"` so the environment is validated before any package loads. See "Configuration" in AGENTS.md.',
                    },
                ],
            },
        },
    ];
}
