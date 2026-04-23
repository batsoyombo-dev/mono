import path from "path";
import { fileURLToPath } from "url";

import dotenv from "dotenv";
import { z } from "zod";

// eslint-disable-next-line turbo/no-undeclared-env-vars
const envFile = `../../../.env.${process.env.NODE_ENV || "development"}`;
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), envFile) });

const _env = z.object({
    NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
    SERVER_PORT: z
        .string()
        .transform((v) => parseInt(v, 10))
        .refine((v) => !Number.isNaN(v), { message: "PORT must be a number" }),
    BASE_URL: z.url(),
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string(),
    REDIS_URL: z.url(),
    REDIS_PASSWORD: z.string(),
    AWS_ACCESS_KEY: z.string(),
    AWS_SECRET_KEY: z.string(),
    AWS_BUCKET_NAME: z.string(),
    AWS_REGION: z.string(),
    AWS_CLOUDFRONT_URL: z.string(),
    BASE_FILE_URL: z.string(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    GOOGLE_REDIRECT_URI: z.url(),
    FACEBOOK_CLIENT_ID: z.string(),
    FACEBOOK_CLIENT_SECRET: z.string(),
    FACEBOOK_REDIRECT_URI: z.url(),
    MAIL_PROVIDER: z.string(),
    MAIL_HOST: z.string(),
    MAIL_REGION: z.string(),
    MAIL_PORT: z.string(),
    MAIL_USERNAME: z.string(),
    MAIL_PASSWORD: z.string(),
    MAIL_ENCRYPTION: z.string(),
    MAIL_FROM_NAME: z.string(),
    MAIL_FROM_ADDRESS: z.string(),
    WEB_BASE_URL: z.string(),
});

export const config = _env.parse(process.env);
export type Config = typeof config;
