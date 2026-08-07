import type { Job, WorkerOptions } from "bullmq";
import { Worker } from "bullmq";

import { logger } from "@mono/logger";
import type { JobNames, Queues } from "@mono/services";

import { jobMap } from "./initialize";

export class DefaultWorker<TQueue extends Queues> {
    private worker: Worker;

    constructor(queueName: TQueue, options?: WorkerOptions) {
        this.worker = new Worker(
            queueName,
            async (job: Job) => {
                const name = job.name as JobNames;

                if (!(name in jobMap)) {
                    throw new Error(`Unknown job: ${job.name}`);
                }

                const { job: execJob, schema } = jobMap[name];

                const validation = await schema.safeParseAsync(job.data);

                if (!validation.success) {
                    throw new Error(`Invalid ${name} job payload: ${validation.error.message}`);
                }

                logger.info(`${queueName}: starting to execute ${name} job!`);
                try {
                    await execJob.handle(job);
                    logger.info(`${queueName}: completed executing ${name} job!`);
                } catch (err) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    logger.error(`${queueName}: failed executing ${name} job! ${error.message}`);
                    throw error;
                }
            },
            options
        );
    }

    onClose(): Promise<void> {
        return this.worker.close();
    }
}
