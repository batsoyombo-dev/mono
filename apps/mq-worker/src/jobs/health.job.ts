import { HealthSchemaType } from "@mono/services";

import { logger } from "@mono/logger";
import { JobDef } from "./job.def";

export const HealthJob: JobDef<HealthSchemaType> = {
    async handle(job) {
        const { data } = job;

        logger.info("MQ worker is working!" + " " + data.pong);
    },
    async completed() {},
    async failed() {},
};
