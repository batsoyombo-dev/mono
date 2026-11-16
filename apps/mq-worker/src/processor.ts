import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";

import type { JobSchemas } from "@mono/services/queues/schema";

import type { JobDef } from "./jobs/job.def";
import { toUnrecoverable } from "./retry";

type ProcessorDeps = {
    schemas: JobSchemas;
    /** One queue's handlers (`createJobMap(...)[queue]`); the job map type-checks payloads. */
    handlers: Record<string, JobDef<never>>;
};

/**
 * Builds the BullMQ processor for one queue. Redis holds the payload as it was enqueued (the
 * schema's input; `TypedQueue` validates but never stores the parsed form), so it is parsed
 * exactly once, here, and the handler receives the output with defaults and transforms applied.
 * Fails without retries when retrying cannot help: an unknown job, an invalid payload, or a
 * handler error that maps to a permanent 4xx (see `isPermanentStatus`).
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
        // In memory only: the handler sees the parsed payload; Redis keeps the enqueued input,
        // so a retry parses the same input again instead of re-parsing parsed output.
        job.data = validation.data;

        await job.log(`Started attempt ${job.attemptsMade + 1}`);
        try {
            const result = await handler.handle(job as Job<never>);
            await job.log("Finished");
            return result;
        } catch (error) {
            throw toUnrecoverable(error) ?? error;
        }
    };
}
