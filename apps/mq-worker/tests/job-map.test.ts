import { describe, expect, test } from "bun:test";
import type { Job } from "bullmq";

import { BadRequestError, NotFoundError } from "@mono/error-handling";
import type { TemplateEmailOptions } from "@mono/services/mail";
import type { MailSchemaType } from "@mono/services/queues/schema";

import type { JobMap } from "../src/job-map";
import { createJobMap } from "../src/job-map";
import { createMailJob, HealthJob } from "../src/jobs";
import { REDACTED, redactMailData } from "../src/jobs/mail.job";

const fakeMail = (send: (options: TemplateEmailOptions) => Promise<{ messageId: string }>) => ({
    sendTemplate: send,
});

/** Just enough of a BullMQ Job for the mail handler, recording logs and data updates. */
function fakeMailJob(data: MailSchemaType, { attemptsMade = 0, attempts = 3 } = {}) {
    const logs: string[] = [];
    const updates: MailSchemaType[] = [];
    const job = {
        id: "1",
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
    test("redactMailData replaces only the listed keys", () => {
        expect(redactMailData(resetMail)).toEqual({
            ...resetMail,
            data: { recipientName: "Ada", resetUrl: REDACTED },
        });
        expect(redactMailData({ ...resetMail, redact: undefined })).toBeNull();
        expect(redactMailData({ ...resetMail, redact: ["missing"] })).toBeNull();
    });

    test("scrubs the listed keys after a successful send", async () => {
        const sent: TemplateEmailOptions[] = [];
        const handler = createMailJob(
            fakeMail(async (options) => {
                sent.push(options);
                return { messageId: "m-1" };
            })
        );
        const { job, updates } = fakeMailJob(resetMail);

        await handler.handle(job);

        // The email used the real link; only the stored copy is scrubbed.
        expect(sent[0]?.data.resetUrl).toBe("https://example.com/reset?token=secret");
        expect(updates).toEqual([
            { ...resetMail, data: { recipientName: "Ada", resetUrl: REDACTED } },
        ]);
    });

    test("keeps the data for a retry, and scrubs it when the job fails for good", async () => {
        const smtpDown = new Error("SMTP timeout");
        const failing = createMailJob(
            fakeMail(async () => {
                throw smtpDown;
            })
        );

        const retried = fakeMailJob(resetMail, { attemptsMade: 0, attempts: 3 });
        await expect(failing.handle(retried.job)).rejects.toBe(smtpDown);
        expect(retried.updates).toEqual([]);

        const lastAttempt = fakeMailJob(resetMail, { attemptsMade: 2, attempts: 3 });
        await expect(failing.handle(lastAttempt.job)).rejects.toBe(smtpDown);
        expect(lastAttempt.updates).toHaveLength(1);

        const permanent = createMailJob(
            fakeMail(async () => {
                throw new NotFoundError("Template");
            })
        );
        const unrecoverable = fakeMailJob(resetMail, { attemptsMade: 0, attempts: 3 });
        await expect(permanent.handle(unrecoverable.job)).rejects.toBeInstanceOf(NotFoundError);
        expect(unrecoverable.updates[0]?.data.resetUrl).toBe(REDACTED);
    });

    test("a redacted job is not sent again", async () => {
        const sent: unknown[] = [];
        const handler = createMailJob(
            fakeMail(async (options) => {
                sent.push(options);
                return { messageId: "m" };
            })
        );
        const { job } = fakeMailJob({ ...resetMail, data: { resetUrl: REDACTED } });

        await expect(handler.handle(job)).rejects.toBeInstanceOf(BadRequestError);
        expect(sent).toEqual([]);
    });

    test("a failed scrub does not fail a job whose email was sent", async () => {
        const handler = createMailJob(fakeMail(async () => ({ messageId: "m" })));
        const { job } = fakeMailJob(resetMail);
        job.updateData = async () => {
            throw new Error("Redis down");
        };

        expect(await handler.handle(job)).toEqual({ messageId: "m" });
    });
});
