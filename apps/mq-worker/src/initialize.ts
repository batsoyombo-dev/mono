import type { JobNames } from "@mono/services";
import { healthSchema, mailSchema } from "@mono/services";

import { HealthJob, MailJob } from "./jobs";
import type { JobDef } from "./jobs/job.def";

export const jobMap = {
    health: {
        schema: healthSchema,
        job: HealthJob,
    },
    mail: {
        schema: mailSchema,
        job: MailJob,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<JobNames, { schema: unknown; job: JobDef<any> }>;
