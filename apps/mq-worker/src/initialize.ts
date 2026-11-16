import type { JobNames } from "@mono/services";

import { HealthJob, MailJob } from "./jobs";
import type { JobDef } from "./jobs/job.def";

// Every job name in the @mono/services queue registry must have a handler here (type-checked).
// Payload schemas live in @mono/services (queueJobSchemas) and are checked before `handle` runs.
export const jobMap = {
    health: HealthJob,
    mail: MailJob,
} satisfies Record<JobNames, JobDef<never>>;
