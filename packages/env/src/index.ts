import { z } from "zod";

import type { EnvGroupName, EnvGroupRule, EnvGroups, EnvSchema } from "./groups";
import { envGroupRules, envGroups } from "./groups";

type EnvSource = Record<string, string | undefined>;

/** The parsed, read-only values of an {@link EnvSchema}. */
export type Env<S extends EnvSchema> = Readonly<z.output<z.ZodObject<S>>>;

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
    value: infer I
) => void
    ? I
    : never;

/** The parsed variables of the chosen groups as one flat object. */
type GroupsEnv<G extends EnvGroupName> = UnionToIntersection<{ [K in G]: Env<EnvGroups[K]> }[G]>;

function parseEnv<S extends EnvSchema>(
    owner: string,
    schema: S,
    source: EnvSource,
    rules: EnvGroupRule[] = []
): Env<S> {
    const parsed = z
        .object(schema)
        .superRefine((values, ctx) => {
            for (const message of rules.flatMap((rule) => rule(values, source))) {
                ctx.addIssue({ code: "custom", message });
            }
        })
        .safeParse(source);

    if (!parsed.success) {
        throw new Error(
            `Invalid environment variables for ${owner}:\n${z.prettifyError(parsed.error)}`
        );
    }

    return Object.freeze(parsed.data) as Env<S>;
}

const groupCache = new Map<EnvGroupName, unknown>();

const rulesFor = (groups: readonly EnvGroupName[]): EnvGroupRule[] =>
    groups.flatMap((name) => envGroupRules[name] ?? []);

/**
 * Typed environment for packages, one property per group: `env.redis.REDIS_URL`. A group is
 * validated the first time it is read, so importing this never throws and code only fails on
 * the variables it actually uses.
 */
export const env = Object.freeze(
    Object.defineProperties(
        {},
        Object.fromEntries(
            (Object.keys(envGroups) as EnvGroupName[]).map((name) => [
                name,
                {
                    enumerable: true,
                    get: () => {
                        if (!groupCache.has(name)) {
                            groupCache.set(
                                name,
                                parseEnv(name, envGroups[name], process.env, rulesFor([name]))
                            );
                        }
                        return groupCache.get(name);
                    },
                },
            ])
        )
    )
) as { readonly [K in EnvGroupName]: Env<EnvGroups[K]> };

type DefineEnvOptions<G extends EnvGroupName, E extends EnvSchema> = {
    /** Groups this app needs. Defaults to every group. */
    groups?: readonly G[];
    /** Variables only this app reads, such as `SERVER_PORT`. */
    extend?: E;
    /** Where to read from. Defaults to `process.env`; tests pass a plain object. */
    source?: EnvSource;
};

/**
 * An app's environment: the groups it runs plus its own variables, validated together so one
 * error lists every problem. Returns a flat, typed object (`config.SERVER_PORT`). Each entry
 * point imports the app's config first, so a bad `.env` fails before any package loads.
 */
export function defineEnv<
    G extends EnvGroupName = EnvGroupName,
    E extends EnvSchema = Record<never, never>,
>(owner: string, options: DefineEnvOptions<G, E> = {}): GroupsEnv<G> & Env<E> {
    const groups = options.groups ?? (Object.keys(envGroups) as G[]);
    const schema = Object.assign({}, ...groups.map((name) => envGroups[name]), options.extend);

    return parseEnv(
        owner,
        schema,
        options.source ?? process.env,
        rulesFor(groups)
    ) as GroupsEnv<G> & Env<E>;
}

export {
    envGroups,
    PLACEHOLDER_AUTH_SECRET,
    type EnvGroupName,
    type EnvGroupRule,
    type EnvSchema,
} from "./groups";
export { commaSeparated, optional, port } from "./helpers";
export { runtimeConfig, type RuntimeConfig } from "./runtime";
