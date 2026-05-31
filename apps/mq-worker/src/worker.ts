import { Job, Worker, WorkerOptions } from "bullmq";

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
                    logger.error("Job does not exist!");
                    return;
                }

                const { job: execJob, schema } = jobMap[name];

                const validation = await schema.safeParseAsync(job.data);

                if (!validation.success) {
                    logger.error("Validation failed!");
                    return;
                }

                logger.info(`${queueName}: starting to execute ${name} job!`);
                try {
                    await execJob.handle(job);
                    logger.info(`${queueName}: completed executing ${name} job!`);
                } catch (err) {
                    if (err instanceof Error) {
                        logger.error(`${queueName}: failed executing ${name} job! ${err.message}`);
                    }
                }
            },
            options
        );
    }

    onClose() {
        this.worker.disconnect();
        this.worker.close();
    }
}
