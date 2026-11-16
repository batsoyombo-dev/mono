import type { Job, JobsOptions, QueueOptions } from "bullmq";
import { Queue } from "bullmq";

import type { InferJobs, JobSchemas } from "./job-schemas";
import { parseJobData } from "./job-schemas";
import type { Queues } from "./names";

const DAY_SECONDS = 24 * 60 * 60;

/** A BullMQ queue whose job names and payloads are checked against its schemas. */
export class TypedQueue<S extends JobSchemas> {
    readonly queue: Queue;

    constructor(
        readonly name: Queues,
        readonly schemas: S,
        opts: QueueOptions
    ) {
        this.queue = new Queue(name, {
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
                // Keep recent runs visible in the dashboard and admin API.
                removeOnComplete: { age: 7 * DAY_SECONDS, count: 1000 },
                removeOnFail: { age: 30 * DAY_SECONDS, count: 5000 },
            },
            ...opts,
        });
    }

    add<K extends keyof S & string>(name: K, data: InferJobs<S>[K], opts?: JobsOptions) {
        return this.enqueue(name, data, opts);
    }

    addBulk<K extends keyof S & string>(
        jobs: { name: K; data: InferJobs<S>[K]; opts?: JobsOptions }[]
    ) {
        return this.queue.addBulk(
            jobs.map((job) => ({
                ...job,
                data: parseJobData(this.name, this.schemas, job.name, job.data),
            }))
        );
    }

    /** Untyped entry point for dynamic input (admin API, CLI). Still validated at runtime. */
    enqueue(name: string, data: unknown, opts?: JobsOptions): Promise<Job> {
        return this.queue.add(name, parseJobData(this.name, this.schemas, name, data), opts);
    }

    close() {
        return this.queue.close();
    }
}
