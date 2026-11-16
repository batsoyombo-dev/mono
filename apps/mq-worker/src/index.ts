import { parseArgs } from "node:util";

import { errorHandler } from "@mono/error-handling";
import { logger } from "@mono/logger";

import { startQueueService } from "./start";

const { values } = parseArgs({
    options: { queue: { type: "string", default: "default" } },
    strict: false,
});

startQueueService(String(values.queue))
    .then((queueName) => {
        logger.info(`${queueName} worker is running`);
    })
    .catch(async (error: unknown) => {
        await errorHandler.handleError(error);
        process.exit(1);
    });
