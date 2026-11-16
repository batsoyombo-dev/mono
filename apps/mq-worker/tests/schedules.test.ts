import { describe, expect, test } from "bun:test";

import { ValidationError } from "@mono/error-handling";
import type { ScheduleMap } from "@mono/services/queues/schema";
import { queueJobSchemas, schedules as appSchedules } from "@mono/services/queues/schema";

import type { SchedulerQueue } from "../src/schedules";
import { syncSchedules } from "../src/schedules";

/** Records scheduler calls against an in-memory list of existing scheduler keys. */
function fakeQueue(existingKeys: string[]) {
    const calls: unknown[][] = [];
    const queue = {
        getJobSchedulers: async () => existingKeys.map((key) => ({ key })),
        removeJobScheduler: async (key: string) => {
            calls.push(["remove", key]);
            return true;
        },
        upsertJobScheduler: async (...args: unknown[]) => {
            calls.push(["upsert", ...args]);
            return undefined;
        },
    } as unknown as SchedulerQueue;
    return { queue, calls };
}

const healthCheck: ScheduleMap["default"][number] = {
    id: "health-check",
    pattern: "0 * * * *",
    job: { name: "health", data: { pong: "scheduled" } },
};

const sync = (queue: SchedulerQueue, schedules: ScheduleMap["default"]) =>
    syncSchedules({ queueName: "default", queue, schedules, schemas: queueJobSchemas.default });

describe("syncSchedules", () => {
    test("removes only cron- schedulers that left the file, and upserts the current ones", async () => {
        const { queue, calls } = fakeQueue([
            "cron-health-check",
            "cron-removed",
            "reminder-user-7",
        ]);

        await sync(queue, [healthCheck, { ...healthCheck, id: "nightly", timezone: "Asia/Tokyo" }]);

        expect(calls).toEqual([
            ["remove", "cron-removed"],
            [
                "upsert",
                "cron-health-check",
                { pattern: "0 * * * *", tz: "UTC" },
                { name: "health", data: { pong: "scheduled" } },
            ],
            [
                "upsert",
                "cron-nightly",
                { pattern: "0 * * * *", tz: "Asia/Tokyo" },
                { name: "health", data: { pong: "scheduled" } },
            ],
        ]);
    });

    test("an invalid payload throws before Redis is touched", async () => {
        const { queue, calls } = fakeQueue(["cron-old"]);
        const invalid = { ...healthCheck, job: { name: "health", data: { pong: 42 } } };

        const error = await sync(queue, [invalid as never]).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('Schedule "health-check"');
        expect((error as ValidationError).issues[0]?.path).toBe("pong");
        expect(calls).toEqual([]);
    });

    test("an invalid cron pattern or timezone throws before Redis is touched", async () => {
        const { queue, calls } = fakeQueue(["cron-old"]);

        await expect(
            sync(queue, [{ ...healthCheck, pattern: "every minute" } as never])
        ).rejects.toThrow(/invalid pattern/);
        await expect(
            sync(queue, [{ ...healthCheck, timezone: "Mars/Olympus" } as never])
        ).rejects.toThrow(/invalid pattern/);
        expect(calls).toEqual([]);
    });

    test("an unknown job name or duplicate id throws", async () => {
        const { queue } = fakeQueue([]);
        const unknown = { ...healthCheck, job: { name: "nope", data: {} } };

        await expect(sync(queue, [unknown as never])).rejects.toBeInstanceOf(ValidationError);
        await expect(sync(queue, [healthCheck, healthCheck])).rejects.toThrow(
            'Duplicate schedule id "health-check"'
        );
    });

    test("every schedule in the app's file is valid", async () => {
        const { queue } = fakeQueue([]);
        await sync(queue, appSchedules.default);
    });
});
