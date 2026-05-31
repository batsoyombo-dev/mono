import { config } from "@mono/global-config";
import { JobsOptions, Queue, QueueOptions } from "bullmq";
import z from "zod";

export const QueueNameSchema = z.enum(["default"]);
export type Queues = z.infer<typeof QueueNameSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class DefaultQueue<TJobMap extends Record<string, any>> {
    private queue: Queue;

    constructor(name: Queues, opts?: QueueOptions) {
        this.queue = new Queue(name, {
            connection: {
                url: config.REDIS_URL,
            },
            ...opts,
        });
    }

    add<K extends keyof TJobMap>(name: K, data: TJobMap[K], opts?: JobsOptions) {
        return this.queue.add(name as string, data, opts);
    }
}
