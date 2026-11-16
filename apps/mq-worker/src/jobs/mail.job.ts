import type { MailClient } from "@mono/services/mail";
import type { MailSchemaType } from "@mono/services/queues";

import type { JobDef } from "./job.def";

export const createMailJob = (mail: Pick<MailClient, "sendTemplate">): JobDef<MailSchemaType> => ({
    async handle(job) {
        await job.log(`Sending "${job.data.template}" to ${job.data.to}`);
        return mail.sendTemplate(job.data);
    },
});
