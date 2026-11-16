import type { MailClient } from "@mono/services/mail";
import type { JobData, QueueJobNames, Queues } from "@mono/services/queues/schema";

import { createMailJob, HealthJob } from "./jobs";
import type { JobDef } from "./jobs/job.def";

export type JobDeps = {
    mail: Pick<MailClient, "sendTemplate">;
};

/**
 * Queue -> job name -> a handler for that job's parsed payload. Every queue and job in
 * @mono/services/queues must have an entry, and a handler written for another job's payload
 * does not type-check.
 */
export type JobMap = {
    [Q in Queues]: { [J in QueueJobNames<Q>]: JobDef<JobData<Q, J>> };
};

/**
 * The worker's handlers, per queue (type-checked against `JobMap`). Payload schemas live in
 * @mono/services/queues (queueJobSchemas) and are checked before `handle` runs. Takes its
 * clients as arguments so tests can pass fakes.
 */
export function createJobMap({ mail }: JobDeps) {
    return {
        default: {
            health: HealthJob,
            mail: createMailJob(mail),
        },
    } satisfies JobMap;
}
