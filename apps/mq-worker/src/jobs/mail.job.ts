import type { MailSchemaType } from "@mono/services";
import { mailClient } from "@mono/services";

import type { JobDef } from "./job.def";

export const MailJob: JobDef<MailSchemaType> = {
    async handle(job) {
        await job.log(`Sending "${job.data.template}" to ${job.data.to}`);
        return mailClient.sendTemplate(job.data);
    },
};
