import { existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Local ESLint rules for the monorepo (`mono/*`). Configured by `boundaries.js`; do not enable
 * them by hand.
 */

const workspaceRoots = new Map();

/** The nearest directory above `file` with a package.json: the file's workspace. */
function workspaceRootOf(file) {
    let dir = path.dirname(file);
    const visited = [];
    while (true) {
        const cached = workspaceRoots.get(dir);
        if (cached !== undefined) {
            for (const seen of visited) workspaceRoots.set(seen, cached);
            return cached;
        }
        visited.push(dir);
        if (existsSync(path.join(dir, "package.json"))) {
            for (const seen of visited) workspaceRoots.set(seen, dir);
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            for (const seen of visited) workspaceRoots.set(seen, null);
            return null;
        }
        dir = parent;
    }
}

function isDirectory(target) {
    try {
        return statSync(target).isDirectory();
    } catch {
        return false;
    }
}

/** `src/config.ts` -> `src/config`; a directory import resolves to its `index`. */
function moduleIdOf(resolved, root) {
    const target = isDirectory(resolved) ? path.join(resolved, "index") : resolved;
    const relative = path.relative(root, target).split(path.sep).join("/");
    return relative.replace(/\.(?:[cm]?[jt]sx?|json)$/, "");
}

/** The string a static source node holds: `"x"` or `` `x` `` without expressions. */
function literalSource(node) {
    if (!node) return null;
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        return node.quasis[0]?.value.cooked ?? null;
    }
    return null;
}

const boundariesRule = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Enforce workspace dependency rules for static imports, re-exports, dynamic import() and require(), including relative paths that leave the workspace.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    allowed: { type: "array", items: { type: "string" } },
                    message: { type: "string" },
                    forbidden: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                path: { type: "string" },
                                message: { type: "string" },
                            },
                            required: ["path", "message"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["allowed", "message"],
                additionalProperties: false,
            },
        ],
        messages: {
            restricted: "'{{source}}' is not allowed here. {{message}}",
            outside:
                "'{{source}}' reaches outside this workspace. Import the other workspace by its @mono/* name instead. {{message}}",
            forbidden: "'{{source}}' is not allowed here. {{message}}",
        },
    },

    create(context) {
        const { allowed, message, forbidden = [] } = context.options[0];
        const allowedRegex = new RegExp(`^(?:${allowed.join("|") || "(?!)"})$`);
        const filename = context.filename;
        const root = path.isAbsolute(filename) ? workspaceRootOf(filename) : null;

        function check(sourceNode) {
            const source = literalSource(sourceNode);
            if (source === null) return;

            if (source === "@mono" || source.startsWith("@mono/")) {
                if (!allowedRegex.test(source.slice("@mono/".length))) {
                    context.report({
                        node: sourceNode,
                        messageId: "restricted",
                        data: { source, message },
                    });
                }
                return;
            }

            if (!root || !(source.startsWith(".") || source.startsWith("/"))) return;

            const resolved = path.resolve(path.dirname(filename), source);
            if (resolved !== root && !resolved.startsWith(root + path.sep)) {
                context.report({
                    node: sourceNode,
                    messageId: "outside",
                    data: { source, message },
                });
                return;
            }

            if (forbidden.length === 0) return;
            const id = moduleIdOf(resolved, root);
            for (const entry of forbidden) {
                if (id === entry.path || id.startsWith(`${entry.path}/`)) {
                    context.report({
                        node: sourceNode,
                        messageId: "forbidden",
                        data: { source, message: entry.message },
                    });
                    return;
                }
            }
        }

        return {
            ImportDeclaration: (node) => check(node.source),
            ExportAllDeclaration: (node) => check(node.source),
            ExportNamedDeclaration: (node) => check(node.source),
            ImportExpression: (node) => check(node.source),
            TSImportEqualsDeclaration: (node) => {
                if (node.moduleReference?.type === "TSExternalModuleReference") {
                    check(node.moduleReference.expression);
                }
            },
            CallExpression: (node) => {
                if (node.callee.type === "Identifier" && node.callee.name === "require") {
                    check(node.arguments[0]);
                }
            },
        };
    },
};

export const monoPlugin = {
    meta: { name: "@mono/eslint-config" },
    rules: { boundaries: boundariesRule },
};
