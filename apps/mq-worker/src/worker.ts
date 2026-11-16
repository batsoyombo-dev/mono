import type { WorkerOptions } from "bullmq";
import { Worker } from "bullmq";

import { logger } from "@mono/logger";
import type { Queues } from "@mono/services/queues/schema";
import { queueJobSchemas } from "@mono/services/queues/schema";

import { jobMap } from "./initialize";
import { createProcessor } from "./processor";

export class DefaultWorker<TQueue extends Queues> {
    private readonly worker: Worker;

    constructor(queueName: TQueue, options: WorkerOptions) {
        this.worker = new Worker(
            queueName,
            createProcessor({
                schemas: queueJobSchemas[queueName],
                handlers: jobMap[queueName],
            }),
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

    /** True while the worker is connected and taking jobs. */
    isRunning(): boolean {
        return this.worker.isRunning();
    }

    close(): Promise<void> {
        return this.worker.close();
    }
}
