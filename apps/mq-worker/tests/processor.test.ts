import { describe, expect, test } from "bun:test";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { z } from "zod";

import { ConflictError, NotFoundError } from "@mono/error-handling";

import { createProcessor } from "../src/processor";

/** Just enough of a BullMQ Job for the processor. */
function fakeJob(name: string, data: unknown) {
    const logs: string[] = [];
    const job = {
        name,
        data,
        attemptsMade: 0,
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
    });
});
