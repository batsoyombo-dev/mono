/**
 * Runs the real processor inside a real BullMQ Worker against Redis (`bun run infra:up`). Run
 * with `bun run test:integration`; `bun run test` skips it. Uses a unique BullMQ key prefix and
 * deletes it afterwards, so it never touches the app's real queues.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { Queue, Worker } from "bullmq";
import { z } from "zod";

import { defineEnv } from "@mono/env";
import { NotFoundError } from "@mono/error-handling";

import { createProcessor } from "../src/processor";

const config = defineEnv("integration-tests", { groups: ["redis"] });
const connection = { url: config.REDIS_URL };
const prefix = `it-worker-${crypto.randomUUID().slice(0, 8)}`;
const queueName = "default";

const ATTEMPTS = 3;
const queue = new Queue(queueName, {
    connection,
    prefix,
    defaultJobOptions: { attempts: ATTEMPTS, backoff: { type: "fixed", delay: 10 } },
});

/** Handler runs per job id, to count attempts. */
const runs = new Map<string, number>();

const schemas = {
    fail: z.object({ kind: z.enum(["not-found", "crash"]) }),
};

const worker = new Worker(
    queueName,
    createProcessor({
        schemas,
        handlers: {
            fail: {
                handle: async (job) => {
                    const { kind } = job.data as z.output<typeof schemas.fail>;
                    runs.set(String(job.id), (runs.get(String(job.id)) ?? 0) + 1);
                    throw kind === "not-found" ? new NotFoundError("User") : new Error("SMTP down");
                },
            },
        },
    }),
    { connection, prefix }
);

afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
});

const TEST_TIMEOUT_MS = 20_000;

/**
 * Polls until the job reaches the failed state, i.e. BullMQ gave up on it, then loads it. The
 * state is checked first: a job read before it moved would carry stale fields (attemptsMade 0).
 * The timeout stays below TEST_TIMEOUT_MS, so a slow run fails with this helper's message.
 */
async function waitForFailed(jobId: string, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if ((await queue.getJobState(jobId)) === "failed") {
            const job = await queue.getJob(jobId);
            if (job) return job;
        }
        await Bun.sleep(25);
    }
    throw new Error(`Job ${jobId} did not fail within ${timeoutMs}ms`);
}

describe("job processor in a BullMQ worker (Redis)", () => {
    test(
        "a 4xx-mapped handler error fails the job after one attempt",
        async () => {
            const added = await queue.add("fail", { kind: "not-found" });

            const job = await waitForFailed(String(added.id));

            expect(runs.get(String(added.id))).toBe(1);
            expect(job.attemptsMade).toBe(1);
            expect(job.failedReason).toBe("NotFoundError: User not found");
            // The original stack is kept, pointing at the handler that threw.
            expect((job.stacktrace ?? []).join("\n")).toContain("processor.integration.test.ts");
        },
        TEST_TIMEOUT_MS
    );

    test(
        "a generic error is retried until the attempts run out",
        async () => {
            const added = await queue.add("fail", { kind: "crash" });

            const job = await waitForFailed(String(added.id));

            expect(runs.get(String(added.id))).toBe(ATTEMPTS);
            expect(job.attemptsMade).toBe(ATTEMPTS);
            expect(job.failedReason).toBe("SMTP down");
        },
        TEST_TIMEOUT_MS
    );

    test(
        "an invalid payload fails without retries and never reaches the handler",
        async () => {
            const added = await queue.add("fail", { kind: "unknown" });

            const job = await waitForFailed(String(added.id));

            expect(runs.has(String(added.id))).toBe(false);
            expect(job.attemptsMade).toBe(1);
        },
        TEST_TIMEOUT_MS
    );
});
