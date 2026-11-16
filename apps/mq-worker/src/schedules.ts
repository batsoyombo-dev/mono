import type { Queue } from "bullmq";
// The parser BullMQ uses for `pattern` (same version), so a pattern that passes here works there.
import { CronExpressionParser } from "cron-parser";

import { AppError, ValidationError } from "@mono/error-handling";
import { logger } from "@mono/logger";
import type { JobSchemas, Queues, ScheduleMap } from "@mono/services/queues/schema";
import { prepareJobData, SCHEDULER_PREFIX, schedulerKey } from "@mono/services/queues/schema";

/** The BullMQ queue methods the sync uses, so tests can pass a fake. */
export type SchedulerQueue = Pick<
    Queue,
    "getJobSchedulers" | "removeJobScheduler" | "upsertJobScheduler"
>;

export type SyncSchedulesOptions<TQueue extends Queues> = {
    queueName: TQueue;
    queue: SchedulerQueue;
    /** This queue's entries from `schedules` (@mono/services/queues). */
    schedules: ScheduleMap[TQueue];
    /** This queue's job schemas (`queueJobSchemas[queueName]`). */
    schemas: JobSchemas;
};

/**
 * Validates every schedule first (id, cron pattern and timezone, payload), so a bad entry stops
 * the worker before Redis is touched and no sync is left half done.
 */
function validateSchedules<TQueue extends Queues>({
    queueName,
    schedules,
    schemas,
}: SyncSchedulesOptions<TQueue>) {
    const seen = new Set<string>();
    return schedules.map(({ id, pattern, timezone, job }) => {
        if (seen.has(id)) {
            throw new ValidationError(`Duplicate schedule id "${id}" on queue "${queueName}"`);
        }
        seen.add(id);

        const tz = timezone ?? "UTC";
        try {
            // Throws RangeError for an unknown zone, which the cron parser accepts silently.
            new Intl.DateTimeFormat("en-US", { timeZone: tz });
            CronExpressionParser.parse(pattern, { tz });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new ValidationError(
                `Schedule "${id}" on queue "${queueName}": invalid pattern "${pattern}" or timezone "${tz}" (${reason})`
            );
        }

        const name = String(job.name);
        try {
            const data = prepareJobData(queueName, schemas, name, job.data);
            return { key: schedulerKey(id), pattern, tz, name, data };
        } catch (error) {
            if (!(error instanceof AppError)) throw error;
            const issues = error instanceof ValidationError ? error.issues : [];
            throw new ValidationError(
                `Schedule "${id}" on queue "${queueName}": ${error.message}`,
                issues
            );
        }
    });
}

/**
 * Upserts this queue's schedules and removes the ones deleted from code. Every schedule's
 * payload is validated against its job schema first; an invalid one throws `ValidationError`,
 * failing the worker at startup instead of failing every cron tick. Only schedulers whose id
 * starts with SCHEDULER_PREFIX are managed here; schedulers your code creates at runtime with
 * other ids are never touched.
 */
export async function syncSchedules<TQueue extends Queues>(
    options: SyncSchedulesOptions<TQueue>
): Promise<void> {
    const { queueName, queue } = options;
    const wanted = validateSchedules(options);
    const wantedKeys = new Set(wanted.map((schedule) => schedule.key));

    for (const existing of await queue.getJobSchedulers()) {
        const managed = existing.key?.startsWith(SCHEDULER_PREFIX);
        if (existing.key && managed && !wantedKeys.has(existing.key)) {
            await queue.removeJobScheduler(existing.key);
            logger.info(`Removed job scheduler ${existing.key}`);
        }
    }

    for (const { key, pattern, tz, name, data } of wanted) {
        await queue.upsertJobScheduler(key, { pattern, tz }, { name, data });
    }

    logger.info(`${queueName}: ${wanted.length} job scheduler(s) registered`);
}
