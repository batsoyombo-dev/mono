import { logger } from "@mono/logger";
import type { HealthSchemaType } from "@mono/services";

import type { JobDef } from "./job.def";

export const HealthJob: JobDef<HealthSchemaType> = {
    async handle(job) {
        logger.info(`Worker is healthy: ${job.data.pong}`);
    },
};
