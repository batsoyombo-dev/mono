import { z } from "zod";

import { mailTemplateSchema } from "../../clients/mail/templates";

export const healthSchema = z.object({
    pong: z.string().max(32),
});

export const mailSchema = z.object({
    to: z.email(),
    subject: z.string().min(1),
    from: z.string().optional(),
    /** One of MAIL_TEMPLATES; an unknown name is rejected at enqueue, never retried. */
    template: mailTemplateSchema,
    data: z.record(z.string(), z.unknown()),
    /**
     * Keys of `data` to scrub from the stored job once it is finished (sent, or failed for good),
     * e.g. `["resetUrl"]`, so live links and tokens do not sit in Redis for the retention period.
     */
    redact: z.array(z.string().min(1).max(100)).max(50).optional(),
});
