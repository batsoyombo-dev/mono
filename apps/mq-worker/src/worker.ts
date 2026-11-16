import type { Job, WorkerOptions } from "bullmq";
import { Worker } from "bullmq";

import { logger } from "@mono/logger";
import type { JobNames, Queues } from "@mono/services";

import { jobMap } from "./initialize";

export class DefaultWorker<TQueue extends Queues> {
    private readonly worker: Worker;

    constructor(queueName: TQueue, options: WorkerOptions) {
        this.worker = new Worker(
            queueName,
            async (job: Job) => {
                const name = job.name as JobNames;

                if (!Object.hasOwn(jobMap, name)) {
                    throw new Error(`Unknown job: ${job.name}`);
                }

                const { job: execJob, schema } = jobMap[name];
                const validation = await schema.safeParseAsync(job.data);

                if (!validation.success) {
                    throw new Error(`Invalid ${name} job payload: ${validation.error.message}`);
                }

                return execJob.handle(job as Job<never>);
            },
            options
        );

        this.worker.on("completed", (job) => {
            logger.info(`${queueName}: ${job.name} job ${job.id} completed`);
        });

        this.worker.on("failed", (job, error) => {
            logger.error(`${queueName}: ${job?.name ?? "unknown"} job ${job?.id} failed`, {
                error,
                attemptsMade: job?.attemptsMade,
            });
        });

        this.worker.on("error", (error) => {
            logger.error(`${queueName}: worker error`, { error });
        });
    }

    close(): Promise<void> {
        return this.worker.close();
    }
}
