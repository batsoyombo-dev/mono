/* eslint-disable @typescript-eslint/no-explicit-any */

import { AppError, errorHandler } from "@mono/error-handling";
import { config } from "@mono/global-config";
import { logger } from "@mono/logger";

import { QueueNameSchema } from "@mono/services";
import { DefaultWorker } from "./worker";

const parseQueueName = (queueName: string) => {
    const result = QueueNameSchema.safeParse(queueName);

    if (!result.success) throw new AppError("Invalid queue name!");

    return result.data;
};

const stopWorker = (worker: DefaultWorker<any>) => {
    worker.onClose();
    process.exit();
};

export async function startQueueService(queueName: string) {
    const parsedQueueName = parseQueueName(queueName);

    const worker = new DefaultWorker(parsedQueueName, {
        connection: {
            url: config.REDIS_URL,
        },
    });

    process.on("uncaughtException", (error) => {
        errorHandler.handleError(error);
    });

    process.on("unhandledRejection", (reason) => {
        errorHandler.handleError(reason);
    });

    process.on("SIGTERM", () => {
        logger.error("App received SIGTERM event, try to gracefully close the server");
        stopWorker(worker);
    });

    process.on("SIGINT", () => {
        logger.error("App received SIGINT event, try to gracefully close the server");
        stopWorker(worker);
    });
}
