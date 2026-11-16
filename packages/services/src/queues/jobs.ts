import type { DefaultQueueJobs } from "./default/jobs";
import { defaultQueueJobSchemas } from "./default/jobs";
import type { Queues } from "./names";
import type { JobSchemas } from "./job-schemas";

/** Job schemas per queue. Importing this never connects to Redis. */
export const queueJobSchemas = {
    default: defaultQueueJobSchemas,
} satisfies Record<Queues, JobSchemas>;

export type QueueMap = {
    default: DefaultQueueJobs;
};

export type QueueJobNames<T extends Queues> = keyof QueueMap[T];

export type JobNames = {
    [K in keyof QueueMap]: keyof QueueMap[K];
}[keyof QueueMap];

export type JobData<T extends Queues, J extends keyof QueueMap[T]> = QueueMap[T][J];
