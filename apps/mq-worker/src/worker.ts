import type { Job, WorkerOptions } from "bullmq";
import { UnrecoverableError, Worker } from "bullmq";

import { logger } from "@mono/logger";
import type { JobNames, JobSchemas, Queues } from "@mono/services";
import { queueJobSchemas } from "@mono/services";

import { jobMap } from "./initialize";

export class DefaultWorker<TQueue extends Queues> {
    private readonly worker: Worker;

    constructor(queueName: TQueue, options: WorkerOptions) {
        const schemas: JobSchemas = queueJobSchemas[queueName];

        this.worker = new Worker(
            queueName,
            async (job: Job) => {
                const name = job.name as JobNames;
                const schema = Object.hasOwn(schemas, name) ? schemas[name] : undefined;

                // Retrying cannot fix an unknown job or a bad payload, so fail immediately.
                if (!schema || !Object.hasOwn(jobMap, name)) {
                    throw new UnrecoverableError(`Unknown job: ${job.name}`);
                }

                const validation = await schema.safeParseAsync(job.data);
                if (!validation.success) {
                    throw new UnrecoverableError(
                        `Invalid ${name} job payload: ${validation.error.message}`
                    );
                }

                await job.log(`Started attempt ${job.attemptsMade + 1}`);
                const result = await jobMap[name].handle(job as Job<never>);
                await job.log("Finished");
                return result;
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
