import { AppError, errorHandler } from "@mono/error-handling";
import { logger } from "@mono/logger";

import { startSchedulerService } from "./start";

async function start() {
    return Promise.all([startSchedulerService()]);
}

start()
    .then(() => {
        logger.info(`Scheduler is running. UTC: ${new Date()}`);
    })
    .catch((error) => {
        errorHandler.handleError(new AppError("startup-failure", error.message));
    });
