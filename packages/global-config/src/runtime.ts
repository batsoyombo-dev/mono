import { z } from "zod";

export const nodeEnv = z
    .enum(["development", "test", "staging", "production"])
    .default("development");
export const logLevel = z
    .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
    .default("info");

// Variables the logger needs. Importing this never throws, so packages that only log
// (and the tests that import them) work without a full .env; `config` validates them strictly.
const _runtime = z.object({
    NODE_ENV: nodeEnv.catch("development"),
    LOG_LEVEL: logLevel.catch("info"),
});

export const runtimeConfig = _runtime.parse(process.env);
export type RuntimeConfig = typeof runtimeConfig;
