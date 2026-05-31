import { z } from "zod";

export const healthSchema = z.object({
    pong: z.string().max(32),
});

export const mailSchema = z.object({
    to: z.string(),
    subject: z.string(),
    from: z.string().optional(),
    template: z.string(),
    data: z.record(z.string(), z.any()),
});
