import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { ValidationError } from "@mono/error-handling";

import { prepareJobData } from "../src/queues/job-schemas";
import { buildQueueOptions, DEFAULT_JOB_OPTIONS } from "../src/queues/queue.def";

const connection = { url: "redis://localhost:6379" };

describe("buildQueueOptions", () => {
    test("uses the default job options when none are passed", () => {
        expect(buildQueueOptions({ connection })).toEqual({
            connection,
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });
    });

    test("merges defaultJobOptions key by key instead of replacing them", () => {
        const { defaultJobOptions } = buildQueueOptions({
            connection,
            prefix: "test",
            defaultJobOptions: { priority: 5, attempts: 10 },
        });

        expect(defaultJobOptions).toEqual({
            ...DEFAULT_JOB_OPTIONS,
            priority: 5,
            attempts: 10,
        });
        expect(defaultJobOptions?.backoff).toEqual({ type: "exponential", delay: 1000 });
        expect(defaultJobOptions?.removeOnFail).toEqual(DEFAULT_JOB_OPTIONS.removeOnFail);
    });
});

describe("prepareJobData", () => {
    const schemas = {
        greet: z.object({
            name: z.string().transform((value) => `${value}!`),
            loud: z.boolean().default(false),
        }),
        dated: z.object({ at: z.date() }),
        coerced: z.object({ at: z.coerce.date() }),
    };

    test("stores the caller's input, not the parsed output", () => {
        expect(prepareJobData("default", schemas, "greet", { name: "Ada" })).toEqual({
            name: "Ada",
        });
    });

    test("validates what the worker will read back from JSON", () => {
        // A Date becomes a string in Redis, so z.date() would fail every attempt in the worker.
        expect(() => prepareJobData("default", schemas, "dated", { at: new Date() })).toThrow(
            ValidationError
        );
        expect(prepareJobData("default", schemas, "coerced", { at: new Date(0) })).toEqual({
            at: "1970-01-01T00:00:00.000Z",
        });
    });

    test("rejects payloads that are not JSON-serializable", () => {
        expect(() => prepareJobData("default", schemas, "greet", { name: 1n })).toThrow(
            ValidationError
        );
    });
});
