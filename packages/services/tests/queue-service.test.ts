import { describe, expect, test } from "bun:test";
import type { Job, JobsOptions, Queue } from "bullmq";

import {
    BadRequestError,
    ConflictError,
    NotFoundError,
    ValidationError,
} from "@mono/error-handling";

import { createQueueService } from "../src/modules/queue/service";
import type { ManagedQueue } from "../src/modules/queue/service";
import { defaultQueueJobSchemas } from "../src/queues/default/jobs";
import { parseJobData } from "../src/queues/job-schemas";
import type { ScheduleMap } from "../src/queues/schedules";

type Added = { name: string; data: unknown; opts?: JobsOptions };

const schedules: ScheduleMap = {
    default: [
        {
            id: "health-check",
            pattern: "0 * * * *",
            job: { name: "health", data: { pong: "scheduled" } },
        },
    ],
};

function fakeJob(overrides: Partial<Job> & { state?: string } = {}): Job {
    const { state = "completed", ...fields } = overrides;
    return {
        id: "1",
        name: "health",
        data: { pong: "x" },
        opts: { attempts: 3 },
        attemptsMade: 1,
        progress: 0,
        timestamp: 1_000,
        processedOn: 2_000,
        finishedOn: 2_500,
        getState: async () => state,
        retry: async () => {},
        promote: async () => {},
        remove: async () => {},
        ...fields,
    } as unknown as Job;
}

/** Mirrors TypedQueue.enqueue: validate with the real schemas, then record the add. */
function setup(jobs: Record<string, Job> = {}) {
    const added: Added[] = [];
    const getJobsCalls: unknown[][] = [];

    const queue = {
        getJob: async (id: string) => jobs[id],
        getJobs: async (...args: unknown[]) => {
            getJobsCalls.push(args);
            return Object.values(jobs);
        },
        getJobCountByTypes: async () => Object.keys(jobs).length,
        getJobLogs: async () => ({ logs: ["Started attempt 1"], count: 1 }),
    } as unknown as Queue;

    const managed: ManagedQueue = {
        name: "default",
        schemas: defaultQueueJobSchemas,
        queue,
        async enqueue(name, data, opts) {
            const parsed = parseJobData("default", defaultQueueJobSchemas, name, data);
            added.push({ name, data: parsed, opts });
            return fakeJob({ id: opts?.jobId ?? "new", name });
        },
    };

    const service = createQueueService({ queues: { default: managed }, schedules });
    return { service, added, getJobsCalls };
}

const actor = { actorUserId: 7 };

describe("parseJobData", () => {
    test("returns the parsed payload", () => {
        expect(parseJobData("default", defaultQueueJobSchemas, "health", { pong: "hi" })).toEqual({
            pong: "hi",
        });
    });

    test("rejects an unknown job name", () => {
        expect(() => parseJobData("default", defaultQueueJobSchemas, "nope", {})).toThrow(
            BadRequestError
        );
    });

    test("rejects an invalid payload", () => {
        expect(() =>
            parseJobData("default", defaultQueueJobSchemas, "mail", { to: "not-an-email" })
        ).toThrow(ValidationError);
    });
});

describe("queue service", () => {
    test("triggers a schedule with its job and payload", async () => {
        const { service, added } = setup();

        const job = await service.triggerSchedule({
            ...actor,
            queue: "default",
            scheduleId: "health-check",
        });

        expect(job.name).toBe("health");
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({ name: "health", data: { pong: "scheduled" } });
        expect(added[0]?.opts?.jobId).toStartWith("manual-health-check-");
    });

    test("rejects an unknown schedule", async () => {
        const { service } = setup();
        await expect(
            service.triggerSchedule({ ...actor, queue: "default", scheduleId: "nope" })
        ).rejects.toThrow(NotFoundError);
    });

    test("enqueues a manual job with options", async () => {
        const { service, added } = setup();

        await service.enqueueJob({
            ...actor,
            queue: "default",
            name: "health",
            data: { pong: "manual" },
            delayMs: 1000,
            jobId: "once",
        });

        expect(added).toEqual([
            {
                name: "health",
                data: { pong: "manual" },
                opts: { delay: 1000, priority: undefined, jobId: "once" },
            },
        ]);
    });

    test("rejects a manual job with an invalid payload", async () => {
        const { service, added } = setup();
        await expect(
            service.enqueueJob({ ...actor, queue: "default", name: "health", data: {} })
        ).rejects.toThrow(ValidationError);
        expect(added).toEqual([]);
    });

    test("lists jobs newest first with pagination", async () => {
        const { service, getJobsCalls } = setup({ "1": fakeJob() });

        const result = await service.listJobs({
            ...actor,
            queue: "default",
            status: "failed",
            page: 2,
            pageSize: 10,
        });

        expect(getJobsCalls).toEqual([[["failed"], 10, 19, false]]);
        expect(result.meta).toEqual({ total: 1, totalPages: 1, page: 2, pageSize: 10 });
        expect(result.collection[0]).toMatchObject({ id: "1", durationMs: 500, maxAttempts: 3 });
    });

    test("returns job detail with logs", async () => {
        const { service } = setup({ "1": fakeJob({ state: "failed" }) });

        const job = await service.getJob({ ...actor, queue: "default", jobId: "1" });

        expect(job).toMatchObject({ id: "1", status: "failed", logs: ["Started attempt 1"] });
    });

    test("rejects an unknown job", async () => {
        const { service } = setup();
        await expect(service.getJob({ ...actor, queue: "default", jobId: "404" })).rejects.toThrow(
            NotFoundError
        );
    });

    test("only retries failed or completed jobs", async () => {
        const { service } = setup({ "1": fakeJob({ state: "active" }) });
        await expect(service.retryJob({ ...actor, queue: "default", jobId: "1" })).rejects.toThrow(
            ConflictError
        );
    });

    test("only promotes delayed jobs", async () => {
        const { service } = setup({ "1": fakeJob({ state: "waiting" }) });
        await expect(
            service.promoteJob({ ...actor, queue: "default", jobId: "1" })
        ).rejects.toThrow(ConflictError);
    });
});
