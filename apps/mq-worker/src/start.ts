import { AppError, errorHandler } from "@mono/error-handling";
import { QueueNameSchema, queues } from "@mono/services";

import { config } from "./config";
import { syncSchedules } from "./schedules";
import { DefaultWorker } from "./worker";

const parseQueueName = (queueName: string) => {
    const result = QueueNameSchema.safeParse(queueName);

    if (!result.success) throw new AppError(`Invalid queue name: ${queueName}`);

    return result.data;
};

export async function startQueueService(queueName: string) {
    const parsedQueueName = parseQueueName(queueName);
    const queue = queues[parsedQueueName];

    const worker = new DefaultWorker(parsedQueueName, {
        connection: { url: config.REDIS_URL },
        concurrency: 5,
    });

    errorHandler.registerShutdownHandler(async () => {
        await worker.close();
        await queue.close();
    });
    errorHandler.listenToErrorEvents();

    await syncSchedules(parsedQueueName, queue);

    return parsedQueueName;
}
