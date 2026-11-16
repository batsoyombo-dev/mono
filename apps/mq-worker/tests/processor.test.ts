import { describe, expect, test } from "bun:test";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { z } from "zod";

import { AppError, ConflictError, NotFoundError } from "@mono/error-handling";
import { prepareJobData } from "@mono/services/queues/schema";

import { createProcessor } from "../src/processor";
import { isLastAttempt, isPermanentStatus, toUnrecoverable } from "../src/retry";

/** Just enough of a BullMQ Job for the processor. */
function fakeJob(name: string, data: unknown) {
    const logs: string[] = [];
    const job = {
        name,
        data,
        attemptsMade: 0,
        opts: { attempts: 3 },
        log: async (line: string) => {
            logs.push(line);
            return logs.length;
        },
    };
    return { job: job as unknown as Job, logs };
}

const schemas = {
    greet: z.object({ name: z.string(), loud: z.boolean().default(false) }),
};

describe("job processor", () => {
    test("hands the handler the parsed payload, with schema defaults applied", async () => {
        const seen: unknown[] = [];
        const process = createProcessor({
            schemas,
            handlers: { greet: { handle: async (job) => seen.push(job.data) } },
        });

        await process(fakeJob("greet", { name: "Ada" }).job);

        expect(seen).toEqual([{ name: "Ada", loud: false }]);
    });

    test("fails unknown jobs and bad payloads without retries", async () => {
        const process = createProcessor({
            schemas,
            handlers: { greet: { handle: async () => {} } },
        });

        await expect(process(fakeJob("missing", {}).job)).rejects.toBeInstanceOf(
            UnrecoverableError
        );
        await expect(process(fakeJob("greet", { name: 1 }).job)).rejects.toBeInstanceOf(
            UnrecoverableError
        );
    });

    test("does not retry client errors, but retries conflicts and crashes", async () => {
        const failingWith = (error: unknown) =>
            createProcessor({
                schemas,
                handlers: {
                    greet: {
                        handle: async () => {
                            throw error;
                        },
                    },
                },
            })(fakeJob("greet", { name: "Ada" }).job);

        await expect(failingWith(new NotFoundError("User"))).rejects.toBeInstanceOf(
            UnrecoverableError
        );
        await expect(failingWith(z.string().safeParse(1).error)).rejects.toBeInstanceOf(
            UnrecoverableError
        );

        const conflict = new ConflictError();
        await expect(failingWith(conflict)).rejects.toBe(conflict);
        const crash = new Error("SMTP timeout");
        await expect(failingWith(crash)).rejects.toBe(crash);

        // Timeouts and rate limits are client errors that clear on a later attempt.
        const timeout = new AppError("Upstream timed out", 408);
        await expect(failingWith(timeout)).rejects.toBe(timeout);
        const rateLimited = new AppError("Slow down", 429);
        await expect(failingWith(rateLimited)).rejects.toBe(rateLimited);
    });

    test("keeps the original error as the cause and its stack", async () => {
        const original = new NotFoundError("User");
        const process = createProcessor({
            schemas,
            handlers: {
                greet: {
                    handle: async () => {
                        throw original;
                    },
                },
            },
        });

        const error = await process(fakeJob("greet", { name: "Ada" }).job).catch(
            (caught: unknown) => caught
        );

        expect(error).toBeInstanceOf(UnrecoverableError);
        expect((error as Error).message).toBe("NotFoundError: User not found");
        expect((error as Error).cause).toBe(original);
        expect((error as Error).stack).toBe(original.stack);
    });

    test("applies transforms and defaults exactly once across enqueue, Redis and the worker", async () => {
        let transforms = 0;
        const counted = {
            greet: z.object({
                name: z.string().transform((value) => {
                    transforms += 1;
                    return `${value}!`;
                }),
                loud: z.boolean().default(false),
            }),
        };
        const seen: unknown[] = [];
        const process = createProcessor({
            schemas: counted,
            handlers: { greet: { handle: async (job) => seen.push(job.data) } },
        });

        // What TypedQueue.add stores, then what BullMQ hands the worker after the JSON round-trip.
        const stored = prepareJobData("default", counted, "greet", { name: "Ada" });
        const fromRedis: unknown = JSON.parse(JSON.stringify(stored));
        expect(fromRedis).toEqual({ name: "Ada" });
        transforms = 0;

        await process(fakeJob("greet", fromRedis).job);
        // A retry reads the same stored input, so it is not transformed twice either.
        await process(fakeJob("greet", fromRedis).job);

        expect(seen).toEqual([
            { name: "Ada!", loud: false },
            { name: "Ada!", loud: false },
        ]);
        expect(transforms).toBe(2);
    });
});

describe("retry classification", () => {
    test("only non-retryable 4xx statuses are permanent", () => {
        expect([400, 401, 403, 404, 422].every(isPermanentStatus)).toBe(true);
        expect([408, 409, 429, 500, 502, 503].some(isPermanentStatus)).toBe(false);
    });

    test("returns retryable errors untouched and passes UnrecoverableError through", () => {
        expect(toUnrecoverable(new Error("network"))).toBeNull();
        const unrecoverable = new UnrecoverableError("stop");
        expect(toUnrecoverable(unrecoverable)).toBe(unrecoverable);
    });

    test("knows the last attempt", () => {
        expect(isLastAttempt({ attemptsMade: 0, opts: { attempts: 3 } })).toBe(false);
        expect(isLastAttempt({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(true);
        expect(isLastAttempt({ attemptsMade: 0, opts: {} })).toBe(true);
    });
});
