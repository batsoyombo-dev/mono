import type { DefaultQueueJobInputs, DefaultQueueJobs } from "./default/jobs";
import { defaultQueueJobSchemas } from "./default/jobs";
import type { JobSchemas } from "./job-schemas";
import type { Queues } from "./names";

/** Job schemas per queue. Importing this never connects to Redis. */
export const queueJobSchemas = {
    default: defaultQueueJobSchemas,
} satisfies Record<Queues, JobSchemas>;

/** Parsed payloads (`z.output`) per queue and job: what handlers receive. */
export type QueueMap = {
    default: DefaultQueueJobs;
};

/** Raw payloads (`z.input`) per queue and job: what `add`, schedules and Redis hold. */
export type QueueInputMap = {
    default: DefaultQueueJobInputs;
};

export type QueueJobNames<T extends Queues> = keyof QueueMap[T];

export type JobNames = {
    [K in keyof QueueMap]: keyof QueueMap[K];
}[keyof QueueMap];

/** The parsed payload a handler receives for job `J` on queue `T`. */
export type JobData<T extends Queues, J extends keyof QueueMap[T]> = QueueMap[T][J];

/** The payload to enqueue for job `J` on queue `T`, before schema defaults and transforms. */
export type JobInputData<T extends Queues, J extends keyof QueueInputMap[T]> = QueueInputMap[T][J];
