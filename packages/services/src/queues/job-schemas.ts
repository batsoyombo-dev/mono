import type { z } from "zod";

import { BadRequestError, toValidationIssues, ValidationError } from "@mono/error-handling";

/** Job name -> zod schema of its payload. One map per queue. */
export type JobSchemas = Record<string, z.ZodType>;
/** What handlers receive: the parsed payload (`z.output`, defaults and transforms applied). */
export type InferJobs<S extends JobSchemas> = { [K in keyof S]: z.output<S[K]> };
/** What callers enqueue: the raw payload (`z.input`). Redis stores this, never the parsed form. */
export type InferJobInputs<S extends JobSchemas> = { [K in keyof S]: z.input<S[K]> };

/**
 * Validates a job payload against its queue's schemas and returns the parsed payload. Throws
 * `BadRequestError` for an unknown job name and `ValidationError` for an invalid payload.
 */
export function parseJobData(queueName: string, schemas: JobSchemas, name: string, data: unknown) {
    const schema = Object.hasOwn(schemas, name) ? schemas[name] : undefined;
    if (!schema) {
        throw new BadRequestError(`Unknown job "${name}" on queue "${queueName}"`);
    }

    const result = schema.safeParse(data);
    if (!result.success) {
        throw new ValidationError(
            `Invalid "${name}" job payload`,
            toValidationIssues(result.error.issues)
        );
    }
    return result.data;
}

/** The payload as the worker will read it back from Redis (BullMQ stores JSON). */
function toWire(name: string, data: unknown): unknown {
    // BullMQ stores a missing payload as `{}`, so validate what the worker will actually see.
    if (data === undefined) return {};
    try {
        return JSON.parse(JSON.stringify(data)) as unknown;
    } catch {
        throw new ValidationError(`Invalid "${name}" job payload`, [
            { path: "", message: "Job payloads must be JSON-serializable" },
        ]);
    }
}

/**
 * Checks a payload before it is enqueued and returns what to store: the caller's **input**, not
 * the parsed output, because the worker parses it again. Storing the output would run transforms
 * twice. The check runs on the JSON round-tripped payload, i.e. exactly what the worker will see,
 * so a schema that cannot survive JSON (`z.date()` given a `Date`; use `z.coerce.date()`) fails
 * here with a `ValidationError` instead of failing every attempt in the worker.
 */
export function prepareJobData(
    queueName: string,
    schemas: JobSchemas,
    name: string,
    data: unknown
): unknown {
    const wire = toWire(name, data);
    parseJobData(queueName, schemas, name, wire);
    return wire;
}
