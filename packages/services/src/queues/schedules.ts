import type { JobData, QueueJobNames } from "./jobs";
import type { Queues } from "./names";

export type Schedule<TQueue extends Queues, TJob extends QueueJobNames<TQueue>> = {
    /** Stable id; changing it creates a new scheduler and removes the old one. */
    id: string;
    /** Cron pattern, evaluated in `timezone` (UTC by default). */
    pattern: string;
    timezone?: string;
    job: { name: TJob; data: JobData<TQueue, TJob> };
};

export type ScheduleMap = {
    [Q in Queues]: Schedule<Q, QueueJobNames<Q>>[];
};

/**
 * Cron jobs, enqueued by BullMQ job schedulers that the worker syncs on start. Redis stores
 * one scheduler per id, so every worker instance can register them and each tick runs once.
 * Run one now with `bun run queue trigger <queue> <id>` or the admin API.
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
