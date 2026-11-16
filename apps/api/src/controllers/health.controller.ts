import { Elysia } from "elysia";

import type { ValidationIssue } from "@mono/error-handling";
import { logger } from "@mono/logger";

import { failure, success } from "../utils/response";

/** Named dependency checks for readiness, e.g. `{ database: () => prisma.$queryRaw\`SELECT 1\` }`. */
export type ReadinessChecks = Record<string, () => Promise<unknown>>;

export type HealthControllerOptions = {
    /** How long one check may take before it counts as failed. */
    timeoutMs?: number;
};

type CheckResult = "ok" | "failed" | "timed out";

const DEFAULT_CHECK_TIMEOUT_MS = 3_000;
const TIMED_OUT = Symbol("timed out");

/** Runs one check. The error stays in the log; the response only says that it failed. */
async function runCheck(
    name: string,
    check: () => Promise<unknown>,
    timeoutMs: number
): Promise<CheckResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });

    try {
        // A check that settles after the timeout is still handled by the race, so a late
        // rejection is never unhandled.
        if ((await Promise.race([check(), timeout])) === TIMED_OUT) {
            logger.error("Readiness check timed out", { check: name, timeoutMs });
            return "timed out";
        }
        return "ok";
    } catch (error) {
        logger.error("Readiness check failed", { check: name, error });
        return "failed";
    } finally {
        clearTimeout(timer);
    }
}

/**
 * `GET /health`: liveness, the process is up (never touches dependencies).
 * `GET /health/ready`: readiness, every check passes. Otherwise 503, with one issue per failing
 * check (`{ path: "database", message: "failed" | "timed out" }`); the errors are logged.
 */
export function createHealthController(
    checks: ReadinessChecks,
    { timeoutMs = DEFAULT_CHECK_TIMEOUT_MS }: HealthControllerOptions = {}
) {
    return new Elysia({ prefix: "/health", name: "Health", detail: { tags: ["health"] } })
        .get("/", () => success({ status: "ok" }))
        .get("/ready", async () => {
            const entries = Object.entries(checks);
            const results = await Promise.all(
                entries.map(([name, check]) => runCheck(name, check, timeoutMs))
            );
            const report = Object.fromEntries(
                entries.map(([name], index) => [name, results[index]])
            );
            const issues: ValidationIssue[] = entries.flatMap(([name], index) =>
                results[index] === "ok" ? [] : [{ path: name, message: results[index]! }]
            );

            return issues.length === 0
                ? success({ status: "ready", checks: report })
                : failure(503, "Service not ready", issues);
        });
}
