import { logger } from "@mono/logger";
import { JobTask } from "../types";

export const healthCheck: JobTask = async () => {
    logger.info("Scheduler is healthy.");
};
