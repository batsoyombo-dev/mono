import { AppError, errorHandler } from "@mono/error-handling";
import { config } from "@mono/global-config";

import { QueueNameSchema } from "@mono/services";
import { DefaultWorker } from "./worker";

const parseQueueName = (queueName: string) => {
    const result = QueueNameSchema.safeParse(queueName);

    if (!result.success) throw new AppError("Invalid queue name!");

    return result.data;
};

export async function startQueueService(queueName: string) {
    const parsedQueueName = parseQueueName(queueName);

    const worker = new DefaultWorker(parsedQueueName, {
        connection: {
            url: config.REDIS_URL,
        },
    });

    errorHandler.registerShutdownHandler(() => worker.onClose());
    errorHandler.listenToErrorEvents();
}
