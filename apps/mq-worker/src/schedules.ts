import type { JobData, QueueJobNames, Queues, TypedQueue } from "@mono/services";
import { logger } from "@mono/logger";

type Schedule<TQueue extends Queues, TJob extends QueueJobNames<TQueue>> = {
    /** Stable id; changing it creates a new scheduler and removes the old one. */
    id: string;
    /** Cron pattern, evaluated in `timezone` (UTC by default). */
    pattern: string;
    timezone?: string;
    job: { name: TJob; data: JobData<TQueue, TJob> };
};

type ScheduleMap = {
    [Q in Queues]: Schedule<Q, QueueJobNames<Q>>[];
};

/**
 * Cron jobs, enqueued by BullMQ job schedulers. Redis stores one scheduler per id, so every
 * worker instance can register them and each tick still runs exactly once.
 */
export const schedules: ScheduleMap = {
    default: [
        {
            id: "health-check",
            pattern: "0 * * * *",
            job: { name: "health", data: { pong: "scheduled" } },
        },
    ],
};

/** Upserts this queue's schedules and removes schedulers that were deleted from code. */
export async function syncSchedules<TQueue extends Queues>(
    queueName: TQueue,
    queue: TypedQueue<Record<string, unknown>>
): Promise<void> {
    const wanted = schedules[queueName];
    const wantedIds = new Set(wanted.map((schedule) => schedule.id));

    for (const existing of await queue.queue.getJobSchedulers()) {
        if (existing.key && !wantedIds.has(existing.key)) {
            await queue.queue.removeJobScheduler(existing.key);
            logger.info(`Removed job scheduler ${existing.key}`);
        }
    }

    for (const { id, pattern, timezone, job } of wanted) {
        await queue.queue.upsertJobScheduler(
            id,
            { pattern, tz: timezone ?? "UTC" },
            { name: String(job.name), data: job.data }
        );
    }

    logger.info(`${queueName}: ${wanted.length} job scheduler(s) registered`);
}
