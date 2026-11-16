import type { Job, JobsOptions, Queue } from "bullmq";
import { ErrorCode } from "bullmq";

import { ConflictError, NotFoundError } from "@mono/error-handling";
import { logger } from "@mono/logger";
import { serializePagination } from "@mono/utils";

import type { Queues } from "../../queues/names";
import type { ScheduleMap } from "../../queues/schedules";
import { schedulerKey } from "../../queues/schedules";
import { cleanJobsSchema, enqueueJobSchema, jobStatusSchema, listJobsQuerySchema } from "./schema";
import type { JobDetail, JobStatus, JobSummary, QueueOperations } from "./types";

/** What the service needs from a queue; `TypedQueue` satisfies it. */
export type ManagedQueue = {
    readonly name: Queues;
    readonly schemas: Record<string, unknown>;
    readonly queue: Queue;
    enqueue(name: string, data: unknown, opts?: JobsOptions): Promise<Job>;
};

export type QueueServiceDeps = {
    queues: Record<Queues, ManagedQueue>;
    schedules: ScheduleMap;
};

const STATUSES = jobStatusSchema.options;

const LOCK_ERROR_CODES: ReadonlySet<unknown> = new Set([
    ErrorCode.JobLockNotExist,
    ErrorCode.JobLockMismatch,
]);

/**
 * BullMQ errors from `job.remove()` that mean "not now" rather than a server fault: the job is
 * the next run of a job scheduler, or another worker holds its lock. Becomes a 409.
 */
function toRemoveConflict(error: unknown): ConflictError | null {
    if (!(error instanceof Error)) return null;
    const code = (error as Error & { code?: unknown }).code;
    if (code === ErrorCode.JobBelongsToJobScheduler) {
        return new ConflictError(
            "This job is the next run of a job scheduler; remove or change the schedule instead"
        );
    }
    if (LOCK_ERROR_CODES.has(code) || /locked by another worker/i.test(error.message)) {
        return new ConflictError("The job is locked by a worker; try again when it finishes");
    }
    return null;
}

const toIso = (ms?: number | null) => (ms ? new Date(ms).toISOString() : null);

function toSummary(job: Job): JobSummary {
    return {
        id: String(job.id),
        name: job.name,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 1,
        progress: job.progress,
        failedReason: job.failedReason ?? null,
        createdAt: toIso(job.timestamp),
        processedAt: toIso(job.processedOn),
        finishedAt: toIso(job.finishedOn),
        durationMs: job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : null,
    };
}

export function createQueueService({ queues, schedules }: QueueServiceDeps): QueueOperations {
    const getQueue = (name: Queues): ManagedQueue => {
        const queue = Object.hasOwn(queues, name) ? queues[name] : undefined;
        if (!queue) throw new NotFoundError(`Queue "${name}"`);
        return queue;
    };

    const getJob = async (name: Queues, jobId: string): Promise<Job> => {
        const job = await getQueue(name).queue.getJob(jobId);
        if (!job) throw new NotFoundError(`Job "${jobId}"`);
        return job;
    };

    const audit = (action: string, details: Record<string, unknown>) => {
        logger.info("Queue action", { action, ...details });
    };

    return {
        async overview() {
            return Promise.all(
                (Object.keys(queues) as Queues[]).map(async (name) => {
                    const { queue, schemas } = getQueue(name);
                    const [counts, paused, registered] = await Promise.all([
                        queue.getJobCounts(...STATUSES),
                        queue.isPaused(),
                        queue.getJobSchedulers(),
                    ]);
                    const nextRuns = new Map(registered.map((s) => [s.key, s.next]));

                    return {
                        name,
                        paused,
                        counts: Object.fromEntries(
                            STATUSES.map((status) => [status, counts[status] ?? 0])
                        ) as Record<JobStatus, number>,
                        jobNames: Object.keys(schemas),
                        schedules: schedules[name].map((schedule) => ({
                            id: schedule.id,
                            pattern: schedule.pattern,
                            timezone: schedule.timezone ?? "UTC",
                            jobName: String(schedule.job.name),
                            registered: nextRuns.has(schedulerKey(schedule.id)),
                            nextRunAt: toIso(nextRuns.get(schedulerKey(schedule.id))),
                        })),
                    };
                })
            );
        },

        async listJobs({ queue: name, ...query }) {
            const { status, page, pageSize } = listJobsQuerySchema.parse(query);
            const { queue } = getQueue(name);
            const start = (page - 1) * pageSize;
            const [jobs, total] = await Promise.all([
                // Newest first.
                queue.getJobs([status], start, start + pageSize - 1, false),
                queue.getJobCountByTypes(status),
            ]);

            return serializePagination(
                { page, pageSize },
                jobs.filter(Boolean).map(toSummary),
                total
            );
        },

        async getJob({ queue: name, jobId }) {
            const job = await getJob(name, jobId);
            const [status, { logs }] = await Promise.all([
                job.getState(),
                getQueue(name).queue.getJobLogs(jobId),
            ]);

            return {
                ...toSummary(job),
                queue: name,
                status,
                data: job.data,
                options: { ...job.opts },
                returnValue: job.returnvalue ?? null,
                stacktrace: job.stacktrace ?? [],
                logs,
            } satisfies JobDetail;
        },

        async enqueueJob({ queue: name, actorUserId, ...payload }) {
            const {
                name: jobName,
                data,
                delayMs,
                priority,
                jobId,
            } = enqueueJobSchema.parse(payload);
            const job = await getQueue(name).enqueue(jobName, data, {
                delay: delayMs,
                priority,
                jobId,
            });

            audit("enqueue", { queue: name, jobName, jobId: job.id, actorUserId });
            return { queue: name, id: String(job.id), name: jobName };
        },

        async triggerSchedule({ queue: name, scheduleId, actorUserId }) {
            const schedule = schedules[name]?.find((entry) => entry.id === scheduleId);
            if (!schedule) throw new NotFoundError(`Schedule "${scheduleId}"`);

            const jobName = String(schedule.job.name);
            const job = await getQueue(name).enqueue(jobName, schedule.job.data, {
                // Random, so two triggers in the same millisecond never dedupe into one job.
                jobId: `manual-${scheduleId}-${crypto.randomUUID()}`,
            });

            audit("trigger-schedule", { queue: name, scheduleId, jobId: job.id, actorUserId });
            return { queue: name, id: String(job.id), name: jobName };
        },

        async retryJob({ queue: name, jobId, actorUserId }) {
            const job = await getJob(name, jobId);
            const state = await job.getState();
            if (state !== "failed" && state !== "completed") {
                throw new ConflictError(
                    `Only failed or completed jobs can be retried (job is ${state})`
                );
            }

            await job.retry(state);
            audit("retry", { queue: name, jobId, actorUserId });
            return { id: jobId };
        },

        async promoteJob({ queue: name, jobId, actorUserId }) {
            const job = await getJob(name, jobId);
            const state = await job.getState();
            if (state !== "delayed") {
                throw new ConflictError(`Only delayed jobs can be promoted (job is ${state})`);
            }

            await job.promote();
            audit("promote", { queue: name, jobId, actorUserId });
            return { id: jobId };
        },

        async removeJob({ queue: name, jobId, actorUserId }) {
            const job = await getJob(name, jobId);
            if ((await job.getState()) === "active") {
                throw new ConflictError("Active jobs cannot be removed");
            }

            try {
                await job.remove();
            } catch (error) {
                throw toRemoveConflict(error) ?? error;
            }
            audit("remove", { queue: name, jobId, actorUserId });
            return { id: jobId };
        },

        async retryFailed({ queue: name, actorUserId }) {
            const { queue } = getQueue(name);
            const retried = await queue.getJobCountByTypes("failed");
            await queue.retryJobs({ state: "failed" });

            audit("retry-failed", { queue: name, retried, actorUserId });
            return { retried };
        },

        async pause({ queue: name, actorUserId }) {
            await getQueue(name).queue.pause();
            audit("pause", { queue: name, actorUserId });
            return { paused: true };
        },

        async resume({ queue: name, actorUserId }) {
            await getQueue(name).queue.resume();
            audit("resume", { queue: name, actorUserId });
            return { paused: false };
        },

        async clean({ queue: name, actorUserId, ...payload }) {
            const { status, olderThanMs, limit } = cleanJobsSchema.parse(payload);
            const removed = await getQueue(name).queue.clean(olderThanMs, limit, status);

            audit("clean", { queue: name, status, removed: removed.length, actorUserId });
            return { removed: removed.length };
        },
    };
}
