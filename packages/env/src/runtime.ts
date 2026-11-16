import { z } from "zod";

export const nodeEnv = z
    .enum(["development", "test", "staging", "production"])
    .default("development");

const logLevels = ["error", "warn", "info", "http", "verbose", "debug", "silly"] as const;

/**
 * `warn` under `NODE_ENV=test` (`bun test` sets it) so test runs only print problems, `info`
 * otherwise. An explicit `LOG_LEVEL` always wins.
 */
export const defaultLogLevel: (typeof logLevels)[number] =
    process.env.NODE_ENV === "test" ? "warn" : "info";

export const logLevel = z.enum(logLevels).default(defaultLogLevel);

// Variables the logger needs. Importing this never throws, so packages that only log
// (and the tests that import them) work without a full .env; `config` validates them strictly.
const _runtime = z.object({
    NODE_ENV: nodeEnv.catch("development"),
    LOG_LEVEL: logLevel.catch(defaultLogLevel),
});

export const runtimeConfig = _runtime.parse(process.env);
export type RuntimeConfig = typeof runtimeConfig;
