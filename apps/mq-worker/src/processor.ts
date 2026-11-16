import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";

import { toAppError } from "@mono/error-handling";
import type { JobSchemas } from "@mono/services/queues";

import type { JobDef } from "./jobs/job.def";

type ProcessorDeps = {
    schemas: JobSchemas;
    handlers: Record<string, JobDef<never>>;
};

/**
 * Client errors that a retry cannot fix: bad input, a missing record, no permission. 409 is
 * left retryable because conflicts (optimistic locks, races) often clear on a later attempt.
 */
function isPermanent(status: number): boolean {
    return status >= 400 && status < 500 && status !== 409;
}

/**
 * Builds the BullMQ processor for one queue: validates the payload, hands the handler the
 * *parsed* data (schema defaults and transforms applied), and fails without retries when
 * retrying cannot help.
 */
export function createProcessor({ schemas, handlers }: ProcessorDeps) {
    return async (job: Job): Promise<unknown> => {
        const schema = Object.hasOwn(schemas, job.name) ? schemas[job.name] : undefined;
        const handler = Object.hasOwn(handlers, job.name) ? handlers[job.name] : undefined;

        if (!schema || !handler) {
            throw new UnrecoverableError(`Unknown job: ${job.name}`);
        }

        const validation = await schema.safeParseAsync(job.data);
        if (!validation.success) {
            throw new UnrecoverableError(
                `Invalid ${job.name} job payload: ${validation.error.message}`
            );
        }
        // In memory only: handlers see the parsed payload; Redis keeps what was enqueued.
        job.data = validation.data;

        await job.log(`Started attempt ${job.attemptsMade + 1}`);
        try {
            const result = await handler.handle(job as Job<never>);
            await job.log("Finished");
            return result;
        } catch (error) {
            const appError = toAppError(error);
            if (isPermanent(appError.statusCode)) {
                throw new UnrecoverableError(`${appError.name}: ${appError.message}`);
            }
            throw error;
        }
    };
}
