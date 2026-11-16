import { env } from "@mono/global-config";

import { createDefaultQueue } from "./default/queue";
import type { JobSchemas } from "./job-schemas";
import type { Queues } from "./names";
import type { TypedQueue } from "./queue.def";

export type QueuesOptions = {
    /** Redis connection string for BullMQ. */
    redisUrl: string;
};

/** Creates every queue, by name. Each queue opens its own Redis connection. */
export function createQueues({ redisUrl }: QueuesOptions) {
    const connection = { url: redisUrl };

    return {
        default: createDefaultQueue({ connection }),
    } satisfies Record<Queues, TypedQueue<JobSchemas>>;
}

export type QueueRegistry = ReturnType<typeof createQueues>;

/** The app's queues. Importing this opens Redis connections; close them on shutdown. */
export const queues: QueueRegistry = createQueues({ redisUrl: env.redis.REDIS_URL });
export const defaultQueue = queues.default;
