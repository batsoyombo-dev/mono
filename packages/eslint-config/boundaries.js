import { monoPlugin } from "./plugin.js";

/**
 * Package dependency rules: which `@mono/*` imports each workspace may use.
 * This map is the source of truth; AGENTS.md "Dependency rules" summarizes it.
 * To allow a new edge, change the map here. Never silence it with eslint-disable.
 *
 * Entries are regular expressions matched against the whole import path after `@mono/`, so
 * `"env"` allows `@mono/env` but not `@mono/env/runtime`.
 *
 * Enforced by `mono/boundaries` (plugin.js) on static imports, `export ... from`, dynamic
 * `import("...")` with a literal path and `require("...")`. The same rule rejects any relative
 * import that resolves outside the importing file's workspace (`../../packages/database/src`,
 * `../../../../database/generated/...`): other workspaces are reached only by their @mono name.
 */
const ALLOWED = {
    env: [],
    utils: [],
    // The logger is imported everywhere, including tests that run without a .env,
    // so it reads the non-throwing runtime subpath instead of the full `config`.
    logger: ["env/runtime"],
    "error-handling": ["logger"],
    database: ["env"],
    cache: ["env", "logger"],
    services: ["cache", "database", "env", "error-handling", "logger", "utils"],
    // @mono/services has no root entry: import a module or area, e.g. @mono/services/notes.
    "mq-worker": [
        "cache",
        "env",
        "error-handling",
        "logger",
        "services/[^/]+",
        "services/[^/]+/(schema|types)",
        "utils",
    ],
    api: [
        "cache",
        "database",
        "env",
        "error-handling",
        "logger",
        "services/[^/]+",
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
            allowed: ["cache", "env", "error-handling", "logger", "utils"],
            reason: "Service modules reach the database through repositories (src/repositories).",
        },
    ],
    // apps/api/src/admin (queue dashboard) is deliberately outside this scope: it needs the real
    // queues and is mounted through createApp({ plugins }), so API tests never load it.
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
            // Relative imports must stay inside the request layer (workspace-relative module ids,
            // no extension). An allowlist, so a new src/lib/db.ts is out until listed here.
            within: ["src/app", "src/controllers", "src/plugins", "src/utils", "tests"],
        },
    ],
};

function describe(allowed) {
    return allowed.length
        ? `Allowed @mono imports here: ${allowed.map((entry) => `@mono/${entry}`).join(", ")}.`
        : "No @mono imports are allowed here.";
}

function restrict(allowed, message, within, withinReason = "") {
    return {
        "mono/boundaries": [
            "error",
            {
                allowed,
                message,
                ...(within
                    ? {
                          within: {
                              paths: within,
                              message: `${withinReason} See "Dependency rules" in AGENTS.md.`,
                          },
                      }
                    : {}),
            },
        ],
    };
}

/**
 * Files that may read the environment directly (AGENTS.md rule 6), keyed by workspace. The
 * env-access rules from base.js are turned off for them.
 */
const ENV_READERS = {
    env: ["src/**/*.ts"],
    // Loaded by the Prisma CLI on its own, outside any app, so they read DATABASE_URL (and the
    // db:check shadow database URL) directly.
    database: ["prisma.config.ts", "scripts/db-check.ts"],
};

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
            plugins: { mono: monoPlugin },
            rules: restrict(allowed, `${describe(allowed)} See "Dependency rules" in AGENTS.md.`),
        },
        ...(SCOPED[workspace] ?? []).map(
            ({ allowed: scopedAllowed, reason, within, ...scope }) => ({
                ...scope,
                rules: restrict(
                    scopedAllowed,
                    `${describe(scopedAllowed)} ${reason} See "Dependency rules" in AGENTS.md.`,
                    within,
                    `The request layer may only import src/app.ts, src/controllers, src/plugins, src/utils and tests (not the entry point, config, seeds or src/admin). ${reason}`
                ),
            })
        ),
        ...(ENV_READERS[workspace]
            ? [
                  {
                      files: ENV_READERS[workspace],
                      rules: {
                          "no-restricted-properties": "off",
                          "no-restricted-syntax": "off",
                      },
                  },
              ]
            : []),
    ];
}
