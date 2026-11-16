import type { z } from "zod";

import type { JobNames } from "@mono/services";
import { healthSchema, mailSchema } from "@mono/services";

import { HealthJob, MailJob } from "./jobs";
import type { JobDef } from "./jobs/job.def";

// Every job name declared in @mono/services queues must have a handler here.
export const jobMap = {
    health: {
        schema: healthSchema,
        job: HealthJob,
    },
    mail: {
        schema: mailSchema,
        job: MailJob,
    },
} satisfies Record<JobNames, { schema: z.ZodType; job: JobDef<never> }>;
