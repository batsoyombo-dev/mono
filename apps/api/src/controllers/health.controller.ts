import { Elysia } from "elysia";

import { failure, success } from "../utils/response";

/** Named dependency checks for readiness, e.g. `{ database: () => prisma.$queryRaw\`SELECT 1\` }`. */
export type ReadinessChecks = Record<string, () => Promise<unknown>>;

const CHECK_TIMEOUT_MS = 3_000;

async function runCheck(check: () => Promise<unknown>): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), CHECK_TIMEOUT_MS);
    });

    try {
        await Promise.race([check(), timeout]);
        return "ok";
    } catch (error) {
        return error instanceof Error ? error.message : "failed";
    } finally {
        clearTimeout(timer);
    }
}

/**
 * `GET /health`: liveness, the process is up (never touches dependencies).
 * `GET /health/ready`: readiness, every check passes (503 with per-check results otherwise).
 */
export function createHealthController(checks: ReadinessChecks) {
    return new Elysia({ prefix: "/health", name: "Health", detail: { tags: ["health"] } })
        .get("/", () => success({ status: "ok" }))
        .get("/ready", async () => {
            const names = Object.keys(checks);
            const results = await Promise.all(names.map((name) => runCheck(checks[name]!)));
            const report = Object.fromEntries(names.map((name, index) => [name, results[index]]));

            return results.every((result) => result === "ok")
                ? success({ status: "ready", checks: report })
                : failure(503, "Service not ready", report);
        });
}
