import type { MailSchemaType } from "@mono/services";
import { mailClient } from "@mono/services";

import type { JobDef } from "./job.def";

export const MailJob: JobDef<MailSchemaType> = {
    async handle(job) {
        const { data } = job;

        await mailClient.sendTemplate(data);
    },
    async completed() {},
    async failed() {},
};
