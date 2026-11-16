import { z } from "zod";

import { commaSeparated, optional, port } from "./helpers";
import { logLevel, nodeEnv } from "./runtime";

export type EnvSchema = Record<string, z.ZodType>;

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
        BASE_URL: z.url(),
        /** Browser origins allowed to call the API; Better Auth trusts the same list. */
        CORS_ORIGINS: commaSeparated(z.url()).default([]),
    },

    database: {
        DATABASE_URL: z.url(),
    },

    redis: {
        REDIS_URL: z.url(),
    },

    auth: {
        BETTER_AUTH_SECRET: z.string().min(32),
        GOOGLE_CLIENT_ID: optional(z.string()),
        GOOGLE_CLIENT_SECRET: optional(z.string()),
    },

    mail: {
        MAIL_HOST: z.string().min(1),
        MAIL_PORT: port,
        MAIL_USERNAME: optional(z.string()),
        MAIL_PASSWORD: optional(z.string()),
        MAIL_ENCRYPTION: z
            .enum(["true", "false", "1", "0", "tls", "ssl", "starttls", "none"])
            .default("true")
            .transform((value) => ["true", "1", "tls", "ssl", "starttls"].includes(value)),
        MAIL_FROM_NAME: z.string().min(1),
        MAIL_FROM_ADDRESS: z.email(),
    },

    storage: {
        AWS_ACCESS_KEY: optional(z.string()),
        AWS_SECRET_KEY: optional(z.string()),
        AWS_BUCKET_NAME: optional(z.string()),
        AWS_REGION: optional(z.string()),
    },
} satisfies Record<string, EnvSchema>;

export type EnvGroups = typeof envGroups;
export type EnvGroupName = keyof EnvGroups;
