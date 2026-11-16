import { z } from "zod";

import { QueueNameSchema } from "../../queues/names";

export const queueNameSchema = QueueNameSchema;

/** BullMQ job states that can be listed. Jobs in a paused queue stay "waiting". */
export const jobStatusSchema = z.enum([
    "waiting",
    "active",
    "delayed",
    "prioritized",
    "completed",
    "failed",
    "waiting-children",
]);

export const queueParamsSchema = z.object({ queue: queueNameSchema });
export const jobParamsSchema = z.object({ queue: queueNameSchema, jobId: z.string().min(1) });
export const scheduleParamsSchema = z.object({
    queue: queueNameSchema,
    scheduleId: z.string().min(1),
});

/** Query strings arrive as text, so numbers are coerced. */
export const listJobsQuerySchema = z.object({
    status: jobStatusSchema.default("completed"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const enqueueJobSchema = z.object({
    name: z.string().min(1),
    data: z.unknown().default({}),
    delayMs: z.number().int().min(0).optional(),
    priority: z.number().int().min(1).max(2_097_152).optional(),
    /**
     * Optional dedupe key: a job with an existing id is not added twice. BullMQ forbids ":" and
     * integer ids (they would collide with its own numeric ids).
     */
    jobId: z
        .string()
        .min(1)
        .max(200)
        .regex(/^[^:]+$/, "jobId must not contain ':'")
        .refine((value) => !/^-?\d+$/.test(value), "jobId must not be an integer")
        .optional(),
});

export const cleanJobsSchema = z.object({
    status: z.enum(["completed", "failed"]),
    /** Only jobs finished at least this long ago are removed. */
    olderThanMs: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(10_000).default(1000),
});
