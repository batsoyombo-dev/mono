import { config } from "@mono/global-config";

import { defaultQueue } from "../../queues";
import { passwordResetEmailSchema, verificationEmailSchema } from "./schema";
import type { PasswordResetEmail, VerificationEmail } from "./types";

const mailJobOptions = {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 1000 },
};

export async function queueVerificationEmail(input: VerificationEmail): Promise<void> {
    const { email, name, verificationUrl } = verificationEmailSchema.parse(input);

    await defaultQueue.add(
        "mail",
        {
            to: email,
            subject: `Verify your ${config.APP_NAME} email address`,
            template: "auth-email-verification",
            data: {
                recipientName: name,
                verificationUrl,
            },
        },
        mailJobOptions
    );
}

export async function queuePasswordResetEmail(input: PasswordResetEmail): Promise<void> {
    const { email, name, resetUrl } = passwordResetEmailSchema.parse(input);

    await defaultQueue.add(
        "mail",
        {
            to: email,
            subject: `Reset your ${config.APP_NAME} password`,
            template: "auth-password-reset",
            data: {
                recipientName: name,
                resetUrl,
            },
        },
        mailJobOptions
    );
}
