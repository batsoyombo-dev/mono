import { isIP } from "node:net";

import { z } from "zod";

import { commaSeparated, optional, port } from "./helpers";
import { logLevel, nodeEnv } from "./runtime";

export type EnvSchema = Record<string, z.ZodType>;

type EnvSource = Record<string, string | undefined>;

/** A check across several variables of one group. Returns one message per problem. */
export type EnvGroupRule = (values: Record<string, unknown>, source: EnvSource) => string[];

/** The secret `.env.example` ships with. Fine locally, rejected in staging and production. */
export const PLACEHOLDER_AUTH_SECRET = "replace-with-a-secret-of-at-least-32-characters";

/** An IP address or CIDR range: `10.0.0.1`, `10.0.0.0/8`, `fd00::/8`. */
const ipOrCidr = z.string().refine((value) => {
    const [address = "", prefix, ...rest] = value.split("/");
    const version = isIP(address);
    if (version === 0 || rest.length > 0) return false;
    if (prefix === undefined) return true;
    const bits = Number(prefix);
    return /^\d+$/.test(prefix) && bits <= (version === 4 ? 32 : 128);
}, "Expected an IP address or CIDR range");

const httpUrl = z.url({ protocol: /^https?$/ });
/** A browser origin; `http://localhost:5173/` is stored as `http://localhost:5173`. */
const origin = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

/**
 * Every shared environment variable, grouped by what it configures. The one place to add a
 * variable (plus `.env.example`). Packages read a group with `env.<group>`; apps validate the
 * groups they run with `defineEnv(...)` in `src/config.ts`. A variable only one app reads goes
 * in that app's `config.ts` instead.
 */
export const envGroups = {
    runtime: {
        NODE_ENV: nodeEnv,
        LOG_LEVEL: logLevel,
    },

    app: {
        APP_NAME: z.string().min(1).default("Mono"),
        /** Public origin of the API; used in auth callbacks and links in emails. */
        BASE_URL: httpUrl,
        /** Browser origins allowed to call the API; Better Auth trusts the same list. */
        CORS_ORIGINS: commaSeparated(origin).default([]),
    },

    database: {
        DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    },

    redis: {
        /** BullMQ. Must use `maxmemory-policy noeviction`, or jobs are silently dropped. */
        REDIS_URL: z.url({ protocol: /^rediss?$/ }),
        /**
         * Optional separate Redis for `cache` and the auth rate-limit counters (may evict keys;
         * an evicted counter only resets a limit early). Defaults to REDIS_URL.
         */
        CACHE_REDIS_URL: optional(z.url({ protocol: /^rediss?$/ })),
    },

    auth: {
        BETTER_AUTH_SECRET: z.string().min(32),
        /**
         * Proxy IPs or CIDR ranges in front of the API whose `X-Forwarded-For` entries are
         * trusted for the client IP (auth rate limits). Empty: only a direct, single-entry header.
         */
        TRUSTED_PROXIES: commaSeparated(ipOrCidr).default([]),
        GOOGLE_CLIENT_ID: optional(z.string()),
        GOOGLE_CLIENT_SECRET: optional(z.string()),
    },

    mail: {
        MAIL_HOST: z.string().min(1),
        MAIL_PORT: port,
        MAIL_USERNAME: optional(z.string()),
        MAIL_PASSWORD: optional(z.string()),
        /**
         * `ssl`: implicit TLS. `starttls`: plain connection upgraded with STARTTLS (required).
         * `false`/`0`: STARTTLS when the server offers it. `none`: never TLS.
         * `true`/`tls`/`1` (default): `ssl` on port 465, else `starttls`.
         */
        MAIL_ENCRYPTION: z
            .enum(["true", "false", "1", "0", "tls", "ssl", "starttls", "none"])
            .default("true")
            .transform((value): "auto" | "ssl" | "starttls" | "opportunistic" | "none" => {
                if (value === "ssl" || value === "starttls" || value === "none") return value;
                return value === "false" || value === "0" ? "opportunistic" : "auto";
            }),
        MAIL_FROM_NAME: z.string().min(1),
        MAIL_FROM_ADDRESS: z.email(),
    },

    storage: {
        AWS_ACCESS_KEY: optional(z.string()),
        AWS_SECRET_KEY: optional(z.string()),
        AWS_BUCKET_NAME: optional(z.string()),
        AWS_REGION: optional(z.string()),
        /** S3-compatible endpoint (MinIO, R2). Empty means AWS. */
        AWS_ENDPOINT: optional(httpUrl),
    },
} satisfies Record<string, EnvSchema>;

export type EnvGroups = typeof envGroups;

const together = (values: Record<string, unknown>, names: string[]): string[] => {
    const set = names.filter((name) => values[name] !== undefined);
    return set.length === 0 || set.length === names.length
        ? []
        : [`Set all of ${names.join(", ")} or none of them (only ${set.join(", ")} is set)`];
};

/** Checks that span several variables of a group; run whenever that group is validated. */
export const envGroupRules: { [K in keyof EnvGroups]?: EnvGroupRule } = {
    auth: (values, source) => {
        const deployed = source.NODE_ENV === "production" || source.NODE_ENV === "staging";
        return deployed && values.BETTER_AUTH_SECRET === PLACEHOLDER_AUTH_SECRET
            ? ["BETTER_AUTH_SECRET is the .env.example placeholder; generate a real secret"]
            : [];
    },
    storage: (values) => [
        ...together(values, ["AWS_BUCKET_NAME", "AWS_REGION"]),
        ...together(values, ["AWS_ACCESS_KEY", "AWS_SECRET_KEY"]),
        ...(values.AWS_BUCKET_NAME === undefined &&
        (values.AWS_ACCESS_KEY !== undefined || values.AWS_ENDPOINT !== undefined)
            ? ["AWS_ACCESS_KEY / AWS_ENDPOINT are set but AWS_BUCKET_NAME is empty"]
            : []),
    ],
};
export type EnvGroupName = keyof EnvGroups;
