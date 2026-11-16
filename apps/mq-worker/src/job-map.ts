import type { JobNames, MailClient } from "@mono/services";

import { createMailJob, HealthJob } from "./jobs";
import type { JobDef } from "./jobs/job.def";

export type JobDeps = {
    mail: Pick<MailClient, "sendTemplate">;
};

/**
 * Every job name in the @mono/services queue registry must have a handler here (type-checked).
 * Payload schemas live in @mono/services (queueJobSchemas) and are checked before `handle` runs.
 * Takes its clients as arguments so tests can pass fakes.
 */
export function createJobMap({ mail }: JobDeps) {
    return {
        health: HealthJob,
        mail: createMailJob(mail),
    } satisfies Record<JobNames, JobDef<never>>;
}
