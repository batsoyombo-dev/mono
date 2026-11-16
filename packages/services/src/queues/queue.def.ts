import type { JobsOptions, QueueOptions } from "bullmq";
import { Queue } from "bullmq";
import { z } from "zod";

import { config } from "@mono/global-config";

export const QueueNameSchema = z.enum(["default"]);
export type Queues = z.infer<typeof QueueNameSchema>;

/** A BullMQ queue whose job names and payloads are checked against `TJobMap`. */
export class TypedQueue<TJobMap extends Record<string, unknown>> {
    readonly queue: Queue;

    constructor(name: Queues, opts?: Omit<QueueOptions, "connection">) {
        this.queue = new Queue(name, {
            connection: { url: config.REDIS_URL },
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 5000 },
            },
            ...opts,
        });
    }

    add<K extends keyof TJobMap & string>(name: K, data: TJobMap[K], opts?: JobsOptions) {
        return this.queue.add(name, data, opts);
    }

    close() {
        return this.queue.close();
    }
}
