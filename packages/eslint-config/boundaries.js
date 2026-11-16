/**
 * Package dependency rules: which `@mono/*` imports each workspace may use.
 * This map is the source of truth; AGENTS.md "Dependency rules" summarizes it.
 * To allow a new edge, change the map here. Never silence it with eslint-disable.
 *
 * Entries are matched exactly against the import path after `@mono/`, so
 * `"services"` allows the package root but not its subpaths.
 */
const ALLOWED = {
    "global-config": [],
    utils: [],
    // The logger is imported everywhere, including tests that run without a .env,
    // so it reads the non-throwing runtime subpath instead of the full `config`.
    logger: ["global-config/runtime"],
    "error-handling": ["logger"],
    database: ["global-config"],
    cache: ["global-config", "logger"],
    services: ["cache", "database", "error-handling", "global-config", "logger", "utils"],
    "mq-worker": ["cache", "error-handling", "global-config", "logger", "services", "utils"],
    api: [
        "cache",
        "database",
        "error-handling",
        "global-config",
        "logger",
        "services",
        "services/[^/]+/(schema|types)",
        "utils",
    ],
};

/** Stricter rules for parts of a workspace, layered on top of ALLOWED. */
const SCOPED = {
    services: [
        {
            files: ["src/modules/**/*.ts"],
            // Better Auth's Prisma adapter needs the client itself.
            ignores: ["src/modules/auth/better-auth.ts"],
            allowed: ["cache", "error-handling", "global-config", "logger", "utils"],
            reason: "Service modules reach the database through repositories (src/repositories).",
        },
    ],
    api: [
        {
            files: [
                "src/app.ts",
                "src/controllers/**/*.ts",
                "src/plugins/**/*.ts",
                "src/utils/**/*.ts",
                "tests/**/*.ts",
            ],
            allowed: ["error-handling", "logger", "services/[^/]+/(schema|types)", "utils"],
            reason: "The request layer receives services and config through createApp(), so tests run without a database or .env.",
        },
    ],
};

function describe(allowed) {
    return allowed.length
        ? `Allowed @mono imports here: ${allowed.map((entry) => `@mono/${entry}`).join(", ")}.`
        : "No @mono imports are allowed here.";
}

function restrict(allowed, message) {
    const regex = allowed.length ? `^@mono/(?!(?:${allowed.join("|")})$)` : "^@mono/";
    return {
        "no-restricted-imports": ["error", { patterns: [{ regex, message }] }],
    };
}

/**
 * @param {keyof typeof ALLOWED} workspace
 * @returns {import("eslint").Linter.Config[]}
 */
export function boundaries(workspace) {
    const allowed = ALLOWED[workspace];
    if (!allowed) {
        throw new Error(`No dependency rules for "${workspace}" in @mono/eslint-config/boundaries`);
    }

    return [
        {
            files: ["**/*.ts"],
            rules: restrict(allowed, `${describe(allowed)} See "Dependency rules" in AGENTS.md.`),
        },
        ...(SCOPED[workspace] ?? []).map(({ allowed: scopedAllowed, reason, ...scope }) => ({
            ...scope,
            rules: restrict(
                scopedAllowed,
                `${describe(scopedAllowed)} ${reason} See "Dependency rules" in AGENTS.md.`
            ),
        })),
    ];
}
