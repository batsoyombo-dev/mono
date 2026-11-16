import { z } from "zod";

const authEmailSchema = z.object({
    email: z.email(),
    // Better Auth accepts any name and has already created the user when this runs,
    // so rejecting a blank name here would leave the account without its email.
    name: z.string().trim().max(120).catch(""),
});

export const verificationEmailSchema = authEmailSchema.extend({
    verificationUrl: z.url(),
});

export const passwordResetEmailSchema = authEmailSchema.extend({
    resetUrl: z.url(),
});
