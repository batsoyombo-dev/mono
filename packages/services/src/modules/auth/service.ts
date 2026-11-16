import type { DefaultQueue } from "../../queues/default/queue";
import { passwordResetEmailSchema, verificationEmailSchema } from "./schema";
import type { AuthEmails, PasswordResetEmail, VerificationEmail } from "./types";

const mailJobOptions = {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 1000 },
};

export type AuthEmailsDeps = {
    queue: Pick<DefaultQueue, "add">;
    appName: string;
};

/**
 * Auth emails are queued, not sent inline, so sign-up never waits on SMTP. Their links work as
 * credentials (verify the address, reset the password), so each job lists them in `redact`:
 * the worker scrubs those `data` keys once the mail is sent or has permanently failed, and the
 * links stop showing in the queue dashboard and admin API.
 */
export function createAuthEmails({ queue, appName }: AuthEmailsDeps): AuthEmails {
    return {
        async queueVerificationEmail(input: VerificationEmail): Promise<void> {
            const { email, name, verificationUrl } = verificationEmailSchema.parse(input);

            await queue.add(
                "mail",
                {
                    to: email,
                    subject: `Verify your ${appName} email address`,
                    template: "auth-email-verification",
                    data: { recipientName: name, verificationUrl },
                    redact: ["verificationUrl"],
                },
                mailJobOptions
            );
        },

        async queuePasswordResetEmail(input: PasswordResetEmail): Promise<void> {
            const { email, name, resetUrl } = passwordResetEmailSchema.parse(input);

            await queue.add(
                "mail",
                {
                    to: email,
                    subject: `Reset your ${appName} password`,
                    template: "auth-password-reset",
                    data: { recipientName: name, resetUrl },
                    redact: ["resetUrl"],
                },
                mailJobOptions
            );
        },
    };
}
