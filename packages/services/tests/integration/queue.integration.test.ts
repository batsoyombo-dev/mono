/**
 * Runs against a real Redis (`bun run infra:up`). Run with `bun run test:integration`;
 * `bun run test` skips it. Uses a unique BullMQ key prefix and deletes it afterwards, so it
 * never touches the app's real queues.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { type Job, Worker } from "bullmq";

import { defineEnv } from "@mono/env";
import { BadRequestError, ValidationError } from "@mono/error-handling";

import { createQueueService } from "../../src/modules/queue/service";
import { createDefaultQueue } from "../../src/queues/default/queue";
import type { ScheduleMap } from "../../src/queues/schedules";

const config = defineEnv("integration-tests", { groups: ["redis"] });
const connection = { url: config.REDIS_URL };
const prefix = `it-${crypto.randomUUID().slice(0, 8)}`;

const queue = createDefaultQueue({ connection, prefix });
const schedules: ScheduleMap = { default: [] };
const queueService = createQueueService({ queues: { default: queue }, schedules });

const processed: Job[] = [];
const worker = new Worker(
    "default",
    async (job) => {
        processed.push(job);
        await job.log("handled in test");
        return { ok: true };
    },
    { connection, prefix }
);

afterAll(async () => {
    await worker.close();
    await queue.queue.obliterate({ force: true });
    await queue.close();
});

function waitForCompletion(jobId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const onCompleted = (job: Job) => {
            if (job.id !== jobId) return;
            worker.off("completed", onCompleted);
            resolve();
        };
        worker.on("completed", onCompleted);
        worker.on("failed", (job, error) => job?.id === jobId && reject(error));
    });
}

describe("default queue (Redis)", () => {
    test("a valid job is enqueued, processed, and visible through the queue service", async () => {
        const job = await queue.add("health", { pong: "integration" });
        await waitForCompletion(String(job.id));

        expect(processed.map((entry) => entry.data)).toContainEqual({ pong: "integration" });

        const detail = await queueService.getJob({
            queue: "default",
            jobId: String(job.id),
            actorUserId: null,
        });
        expect(detail).toMatchObject({
            status: "completed",
            name: "health",
            data: { pong: "integration" },
            returnValue: { ok: true },
        });
        expect(detail.logs).toContain("handled in test");
    });

    test("bad payloads and unknown job names are rejected before reaching Redis", async () => {
        const before = await queue.queue.getJobCountByTypes("waiting", "completed", "failed");

        await expect(queue.enqueue("health", { pong: 42 })).rejects.toBeInstanceOf(ValidationError);
        await expect(queue.enqueue("no-such-job", {})).rejects.toBeInstanceOf(BadRequestError);

        expect(await queue.queue.getJobCountByTypes("waiting", "completed", "failed")).toBe(before);
    });

    test("overview reports counts for the queue", async () => {
        const [overview] = await queueService.overview({ actorUserId: null });

        expect(overview).toMatchObject({ name: "default", paused: false });
        expect(overview?.counts.completed).toBeGreaterThanOrEqual(1);
    });
});
