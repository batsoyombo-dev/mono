import { logger } from "@mono/logger";
import type { JobSchemas, Queues, TypedQueue } from "@mono/services/queues";
import { SCHEDULER_PREFIX, schedulerKey, schedules } from "@mono/services/queues";

/**
 * Upserts this queue's schedules and removes the ones deleted from code. Only schedulers whose
 * id starts with SCHEDULER_PREFIX are managed here; schedulers your code creates at runtime
 * with other ids are never touched.
 */
export async function syncSchedules<TQueue extends Queues>(
    queueName: TQueue,
    queue: TypedQueue<JobSchemas>
): Promise<void> {
    const wanted = schedules[queueName];
    const wantedKeys = new Set(wanted.map((schedule) => schedulerKey(schedule.id)));

    for (const existing of await queue.queue.getJobSchedulers()) {
        const managed = existing.key?.startsWith(SCHEDULER_PREFIX);
        if (existing.key && managed && !wantedKeys.has(existing.key)) {
            await queue.queue.removeJobScheduler(existing.key);
            logger.info(`Removed job scheduler ${existing.key}`);
        }
    }

    for (const { id, pattern, timezone, job } of wanted) {
        await queue.queue.upsertJobScheduler(
            schedulerKey(id),
            { pattern, tz: timezone ?? "UTC" },
            { name: String(job.name), data: job.data }
        );
    }

    logger.info(`${queueName}: ${wanted.length} job scheduler(s) registered`);
}
