import { describe, expect, test } from "bun:test";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";

import { NotFoundError } from "@mono/error-handling";
import type { TemplateEmailOptions } from "@mono/services/mail";
import type { MailSchemaType } from "@mono/services/queues/schema";
import { queueJobSchemas } from "@mono/services/queues/schema";

import type { JobMap } from "../src/job-map";
import { createJobMap } from "../src/job-map";
import { createMailJob, HealthJob } from "../src/jobs";
import type { JobDef } from "../src/jobs/job.def";
import { REDACTED, redactMailData } from "../src/jobs/mail.job";
import { createProcessor } from "../src/processor";

const fakeMail = (send: (options: TemplateEmailOptions) => Promise<{ messageId: string }>) => ({
    sendTemplate: send,
});

/** Just enough of a BullMQ Job for the mail handler, recording logs and data updates. */
function fakeMailJob(data: MailSchemaType, { attemptsMade = 0, attempts = 3 } = {}) {
    const logs: string[] = [];
    const updates: unknown[] = [];
    const job = {
        id: "1",
        name: "mail",
        data,
        attemptsMade,
        opts: { attempts },
        log: async (line: string) => logs.push(line),
        updateData: async (next: MailSchemaType) => {
            updates.push(next);
            job.data = next;
        },
    };
    return { job: job as unknown as Job<MailSchemaType>, logs, updates };
}

const resetMail: MailSchemaType = {
    to: "ada@example.com",
    subject: "Hi",
    template: "auth-password-reset",
    data: { recipientName: "Ada", resetUrl: "https://example.com/reset?token=secret" },
    redact: ["resetUrl"],
};

describe("worker job map", () => {
    test("the mail job sends through the injected mail client", async () => {
        const sent: TemplateEmailOptions[] = [];
        const jobs = createJobMap({
            mail: fakeMail(async (options) => {
                sent.push(options);
                return { messageId: "m-1" };
            }),
        });
        const data: MailSchemaType = { ...resetMail, redact: undefined };
        const { job, logs, updates } = fakeMailJob(data);

        const result = await jobs.default.mail.handle(job);

        expect(result).toEqual({ messageId: "m-1" });
        expect(sent).toEqual([data]);
        expect(logs).toEqual([`Sending "auth-password-reset" to ada@example.com`]);
        expect(updates).toEqual([]);
    });

    test("handlers are type-checked against their job's payload", () => {
        const mail = fakeMail(async () => ({ messageId: "m" }));
        const swapped = {
            default: {
                // @ts-expect-error a mail handler cannot handle health payloads
                health: createMailJob(mail),
                // @ts-expect-error the health handler cannot handle mail payloads
                mail: HealthJob,
            },
        } satisfies JobMap;

        // @ts-expect-error every job needs a handler
        const missing = { default: { health: HealthJob } } satisfies JobMap;

        expect(Object.keys(swapped.default)).toEqual(["health", "mail"]);
        expect(Object.keys(missing.default)).toEqual(["health"]);
    });
});

describe("mail job redaction", () => {
    // Through the real processor and mail schema, which own the redaction lifecycle.
    const mailProcessor = (send: Parameters<typeof fakeMail>[0]) =>
        createProcessor({
            schemas: queueJobSchemas.default,
            handlers: { mail: createMailJob(fakeMail(send)) as JobDef<never> },
        });
    const mailJob = (data: unknown, options?: { attemptsMade?: number; attempts?: number }) => {
        const fake = fakeMailJob(data as MailSchemaType, options);
        (fake.job as { name: string }).name = "mail";
        return fake;
    };
    const scrubbed = { ...resetMail, data: { recipientName: "Ada", resetUrl: REDACTED } };

    test("redactMailData replaces only the listed keys", () => {
        expect(redactMailData(resetMail)).toEqual(scrubbed);
        expect(redactMailData({ ...resetMail, redact: undefined })).toBeNull();
        expect(redactMailData({ ...resetMail, redact: ["missing"] })).toBeNull();
        expect(redactMailData("not an object")).toBeNull();
    });

    test("scrubs the stored payload after a successful send", async () => {
        const sent: TemplateEmailOptions[] = [];
        const { job, updates } = mailJob(resetMail);

        await mailProcessor(async (options) => {
            sent.push(options);
            return { messageId: "m-1" };
        })(job);

        // The email used the real link; only the stored copy is scrubbed.
        expect(sent[0]?.data.resetUrl).toBe("https://example.com/reset?token=secret");
        expect(updates).toEqual([scrubbed]);
    });

    test("keeps the data for a retry, and scrubs it when the job fails for good", async () => {
        const smtpDown = new Error("SMTP timeout");
        const failing = mailProcessor(async () => {
            throw smtpDown;
        });

        const retried = mailJob(resetMail, { attemptsMade: 0, attempts: 3 });
        await expect(failing(retried.job)).rejects.toBe(smtpDown);
        expect(retried.updates).toEqual([]);

        const lastAttempt = mailJob(resetMail, { attemptsMade: 2, attempts: 3 });
        await expect(failing(lastAttempt.job)).rejects.toBe(smtpDown);
        expect(lastAttempt.updates).toEqual([scrubbed]);

        const permanent = mailJob(resetMail);
        await expect(
            mailProcessor(async () => {
                throw new NotFoundError("Template");
            })(permanent.job)
        ).rejects.toBeInstanceOf(UnrecoverableError);
        expect(permanent.updates).toEqual([scrubbed]);
    });

    test("scrubs a payload the schema rejects, without sending it", async () => {
        const invalid = { ...resetMail, template: "removed-template" };
        const sent: unknown[] = [];
        const { job, updates } = mailJob(invalid);

        await expect(
            mailProcessor(async (options) => {
                sent.push(options);
                return { messageId: "m" };
            })(job)
        ).rejects.toBeInstanceOf(UnrecoverableError);

        expect(sent).toEqual([]);
        expect(updates).toEqual([{ ...invalid, data: scrubbed.data }]);
    });

    test("writes back the stored input, not the parsed payload", async () => {
        // No `redact`-irrelevant defaults are added to what goes back to Redis.
        const stored = { ...resetMail, extra: "kept as enqueued" };
        const { job, updates } = mailJob(stored);

        await mailProcessor(async () => ({ messageId: "m" }))(job);

        expect(updates).toEqual([{ ...stored, data: scrubbed.data }]);
    });

    test("a redacted job is not sent again", async () => {
        const sent: unknown[] = [];
        const { job } = mailJob({
            ...resetMail,
            data: { recipientName: "Ada", resetUrl: REDACTED },
        });

        await expect(
            mailProcessor(async (options) => {
                sent.push(options);
                return { messageId: "m" };
            })(job)
        ).rejects.toBeInstanceOf(UnrecoverableError);
        expect(sent).toEqual([]);
    });

    test("a failed scrub does not fail a job whose email was sent", async () => {
        const { job } = mailJob(resetMail);
        job.updateData = async () => {
            throw new Error("Redis down");
        };

        expect(await mailProcessor(async () => ({ messageId: "m" }))(job)).toEqual({
            messageId: "m",
        });
    });
});
