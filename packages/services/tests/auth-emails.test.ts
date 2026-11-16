import { describe, expect, test } from "bun:test";

import type { AuthEmailsDeps } from "../src/modules/auth/service";
import { createAuthEmails } from "../src/modules/auth/service";

/** Records every job instead of reaching Redis. */
function fakeQueue() {
    const jobs: unknown[][] = [];
    const queue = {
        add: async (...args: unknown[]) => {
            jobs.push(args);
            return {} as never;
        },
    } as unknown as AuthEmailsDeps["queue"];

    return { queue, jobs };
}

describe("auth emails", () => {
    test("queue the verification mail and mark its link for redaction", async () => {
        const { queue, jobs } = fakeQueue();

        await createAuthEmails({ queue, appName: "Mono" }).queueVerificationEmail({
            email: "ada@example.com",
            name: "Ada",
            verificationUrl: "https://api.example.com/verify?token=secret",
        });

        expect(jobs).toEqual([
            [
                "mail",
                {
                    to: "ada@example.com",
                    subject: "Verify your Mono email address",
                    template: "auth-email-verification",
                    data: {
                        recipientName: "Ada",
                        verificationUrl: "https://api.example.com/verify?token=secret",
                    },
                    redact: ["verificationUrl"],
                },
                expect.objectContaining({ attempts: 5 }),
            ],
        ]);
    });

    test("queue the password reset mail and mark its link for redaction", async () => {
        const { queue, jobs } = fakeQueue();

        await createAuthEmails({ queue, appName: "Mono" }).queuePasswordResetEmail({
            email: "ada@example.com",
            name: "Ada",
            resetUrl: "https://api.example.com/reset?token=secret",
        });

        expect(jobs).toEqual([
            [
                "mail",
                {
                    to: "ada@example.com",
                    subject: "Reset your Mono password",
                    template: "auth-password-reset",
                    data: {
                        recipientName: "Ada",
                        resetUrl: "https://api.example.com/reset?token=secret",
                    },
                    redact: ["resetUrl"],
                },
                expect.objectContaining({ attempts: 5 }),
            ],
        ]);
    });
});
