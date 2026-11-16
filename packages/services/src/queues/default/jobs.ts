import type { InferJobs } from "../job-schemas";
import { healthSchema, mailSchema } from "./schemas";

/** Every job the default queue accepts. Add a job here, then a handler in apps/mq-worker. */
export const defaultQueueJobSchemas = {
    health: healthSchema,
    mail: mailSchema,
};

export type DefaultQueueJobs = InferJobs<typeof defaultQueueJobSchemas>;
