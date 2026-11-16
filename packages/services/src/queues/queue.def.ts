import type { Job, JobsOptions, QueueOptions } from "bullmq";
import { Queue } from "bullmq";

import type { InferJobInputs, JobSchemas } from "./job-schemas";
import { prepareJobData } from "./job-schemas";
import type { Queues } from "./names";

const DAY_SECONDS = 24 * 60 * 60;

/** Job options every queue starts from; `defaultJobOptions` passed to a queue override per key. */
export const DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    // Keep recent runs visible in the dashboard and admin API.
    removeOnComplete: { age: 7 * DAY_SECONDS, count: 1000 },
    removeOnFail: { age: 30 * DAY_SECONDS, count: 5000 },
} satisfies JobsOptions;

/**
 * Queue options with `defaultJobOptions` merged key by key over `DEFAULT_JOB_OPTIONS`, so
 * passing `{ defaultJobOptions: { priority: 1 } }` keeps the default attempts, backoff and
 * retention instead of replacing them all.
 */
export function buildQueueOptions(opts: QueueOptions): QueueOptions {
    return {
        ...opts,
        defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, ...opts.defaultJobOptions },
    };
}

/**
 * A BullMQ queue whose job names and payloads are checked against its schemas. Callers pass the
 * schema's input (`z.input`); Redis stores that input and the worker parses it once, so handlers
 * receive `z.output` with defaults and transforms applied exactly once.
 */
export class TypedQueue<S extends JobSchemas> {
    readonly queue: Queue;

    constructor(
        readonly name: Queues,
        readonly schemas: S,
        opts: QueueOptions
    ) {
        this.queue = new Queue(name, buildQueueOptions(opts));
    }

    add<K extends keyof S & string>(name: K, data: InferJobInputs<S>[K], opts?: JobsOptions) {
        return this.enqueue(name, data, opts);
    }

    // async so a validation error is a rejected promise, never a synchronous throw.
    async addBulk<K extends keyof S & string>(
        jobs: { name: K; data: InferJobInputs<S>[K]; opts?: JobsOptions }[]
    ) {
        return this.queue.addBulk(
            jobs.map((job) => ({
                ...job,
                data: prepareJobData(this.name, this.schemas, job.name, job.data),
            }))
        );
    }

    /** Untyped entry point for dynamic input (admin API, CLI). Still validated at runtime. */
    async enqueue(name: string, data: unknown, opts?: JobsOptions): Promise<Job> {
        return this.queue.add(name, prepareJobData(this.name, this.schemas, name, data), opts);
    }

    /** One Redis round-trip; throws when the queue's Redis is unreachable. For readiness checks. */
    async ping(): Promise<void> {
        await this.queue.isPaused();
    }

    close() {
        return this.queue.close();
    }
}
