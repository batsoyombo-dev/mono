import { logger } from "@mono/logger";
import type { JobSchemas, Queues, TypedQueue } from "@mono/services";
import { schedules } from "@mono/services";

/** Upserts this queue's schedules and removes schedulers that were deleted from code. */
export async function syncSchedules<TQueue extends Queues>(
    queueName: TQueue,
    queue: TypedQueue<JobSchemas>
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
