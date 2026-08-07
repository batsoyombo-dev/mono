import "dotenv/config";
import minimist from "minimist";

import { errorHandler } from "@mono/error-handling";
import { logger } from "@mono/logger";

import { startQueueService } from "./start";

const args = minimist(process.argv.slice(2));

const queueName = args.queue || "default";

async function start() {
    return Promise.all([startQueueService(queueName)]);
}

start()
    .then(() => {
        logger.info(`${queueName} worker is running. UTC: ${new Date()}`);
    })
    .catch((error) => {
        void errorHandler.handleError(error);
    });
