import type { z } from "zod";

import { BadRequestError, ValidationError } from "@mono/error-handling";

/** Job name -> zod schema of its payload. One map per queue. */
export type JobSchemas = Record<string, z.ZodType>;
export type InferJobs<S extends JobSchemas> = { [K in keyof S]: z.infer<S[K]> };

/**
 * Validates a job payload against its queue's schemas. Throws `BadRequestError` for an
 * unknown job name and `ValidationError` for an invalid payload, before anything reaches Redis.
 */
export function parseJobData(queueName: string, schemas: JobSchemas, name: string, data: unknown) {
    const schema = Object.hasOwn(schemas, name) ? schemas[name] : undefined;
    if (!schema) {
        throw new BadRequestError(`Unknown job "${name}" on queue "${queueName}"`);
    }

    const result = schema.safeParse(data);
    if (!result.success) {
        throw new ValidationError(`Invalid "${name}" job payload`, { issues: result.error.issues });
    }
    return result.data;
}
