import { describe, expect, test } from "bun:test";
import type { Job } from "bullmq";

import type { TemplateEmailOptions } from "@mono/services/mail";
import type { MailSchemaType } from "@mono/services/queues";

import { createJobMap } from "../src/job-map";

describe("worker job map", () => {
    test("the mail job sends through the injected mail client", async () => {
        const sent: TemplateEmailOptions[] = [];
        const jobs = createJobMap({
            mail: {
                sendTemplate: async (options) => {
                    sent.push(options);
                    return { messageId: "m-1" };
                },
            },
        });
        const logs: string[] = [];
        const data: MailSchemaType = {
            to: "ada@example.com",
            subject: "Hi",
            template: "auth-password-reset",
            data: { resetUrl: "https://example.com/reset" },
        };

        const result = await jobs.mail.handle({
            data,
            log: async (line: string) => logs.push(line),
        } as unknown as Job<MailSchemaType>);

        expect(result).toEqual({ messageId: "m-1" });
        expect(sent).toEqual([data]);
        expect(logs).toEqual([`Sending "auth-password-reset" to ada@example.com`]);
    });
});
