import { errorHandler } from "@mono/error-handling";
import { logger } from "@mono/logger";
import "dotenv/config";

import { startSchedulerService } from "./start";

async function start() {
    return Promise.all([startSchedulerService()]);
}

start()
    .then(() => {
        logger.info(`Scheduler is running. UTC: ${new Date()}`);
    })
    .catch((error) => {
        void errorHandler.handleError(error);
    });
