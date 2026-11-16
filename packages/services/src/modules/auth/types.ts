import type { z } from "zod";

import type { passwordResetEmailSchema, verificationEmailSchema } from "./schema";

export type VerificationEmail = z.infer<typeof verificationEmailSchema>;
export type PasswordResetEmail = z.infer<typeof passwordResetEmailSchema>;

export type AuthEmails = {
    queueVerificationEmail(input: VerificationEmail): Promise<void>;
    queuePasswordResetEmail(input: PasswordResetEmail): Promise<void>;
};
