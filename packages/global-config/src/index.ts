import { z } from "zod";

import { logLevel, nodeEnv } from "./runtime";

// Empty strings in .env mean "not configured" for optional integrations.
const optional = <T extends z.ZodType>(schema: T) =>
    z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const commaSeparatedUrls = z
    .string()
    .transform((value) =>
        value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
    )
    .pipe(z.array(z.url()));

const commaSeparatedEmails = z
    .string()
    .transform((value) =>
        value
            .split(",")
            .map((entry) => entry.trim().toLowerCase())
            .filter(Boolean)
    )
    .pipe(z.array(z.email()));

const _env = z.object({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    APP_NAME: z.string().min(1).default("Mono"),
    SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BASE_URL: z.url(),
    CORS_ORIGINS: commaSeparatedUrls.default([]),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    BETTER_AUTH_SECRET: z.string().min(32),
    /** Verified users with these emails can use the queue admin API and dashboard. */
    ADMIN_EMAILS: commaSeparatedEmails.default([]),

    MAIL_HOST: z.string().min(1),
    MAIL_PORT: z.coerce.number().int().min(1).max(65535),
    MAIL_USERNAME: optional(z.string()),
    MAIL_PASSWORD: optional(z.string()),
    MAIL_ENCRYPTION: z
        .enum(["true", "false", "1", "0", "tls", "ssl", "starttls", "none"])
        .default("true")
        .transform((value) => ["true", "1", "tls", "ssl", "starttls"].includes(value)),
    MAIL_FROM_NAME: z.string().min(1),
    MAIL_FROM_ADDRESS: z.email(),

    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),

    AWS_ACCESS_KEY: optional(z.string()),
    AWS_SECRET_KEY: optional(z.string()),
    AWS_BUCKET_NAME: optional(z.string()),
    AWS_REGION: optional(z.string()),
});

const parsed = _env.safeParse(process.env);

if (!parsed.success) {
    // Print every invalid variable at once, before anything else boots.
    console.error("Invalid environment variables:\n" + z.prettifyError(parsed.error));
    throw new Error("Invalid environment variables");
}

export const config = parsed.data;
export type Config = typeof config;

export { runtimeConfig, type RuntimeConfig } from "./runtime";
