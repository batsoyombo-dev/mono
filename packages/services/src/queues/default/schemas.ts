import { z } from "zod";

export const healthSchema = z.object({
    pong: z.string().max(32),
});

export const mailSchema = z.object({
    to: z.email(),
    subject: z.string().min(1),
    from: z.string().optional(),
    template: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
});
