import type { MailSchemaType } from "@mono/services";
import { mailClient } from "@mono/services";

import type { JobDef } from "./job.def";

export const MailJob: JobDef<MailSchemaType> = {
    async handle(job) {
        return mailClient.sendTemplate(job.data);
    },
};
