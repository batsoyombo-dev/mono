import { AppError, errorHandler } from "@mono/error-handling";
import { logger } from "@mono/logger";
import { closeServices } from "@mono/services/lifecycle";
import { queueJobSchemas, QueueNameSchema, queues, schedules } from "@mono/services/queues";

import { config } from "./config";
import { syncSchedules } from "./schedules";
import { DefaultWorker } from "./worker";

const parseQueueName = (queueName: string) => {
    const result = QueueNameSchema.safeParse(queueName);

    if (!result.success) throw new AppError(`Invalid queue name: ${queueName}`);

    return result.data;
};

/** Liveness for orchestrators: 200 while the worker runs and its queue's Redis answers. */
function serveHealth(port: number, worker: { isRunning(): boolean }, ping: () => Promise<void>) {
    const server = Bun.serve({
        port,
        async fetch(request) {
            if (new URL(request.url).pathname !== "/health") {
                return new Response("Not found", { status: 404 });
            }
            const redis = await ping().then(
                () => "ok",
                (error: unknown) => (error instanceof Error ? error.message : "failed")
            );
            const healthy = worker.isRunning() && redis === "ok";
            return Response.json(
                { status: healthy ? "ok" : "unhealthy", running: worker.isRunning(), redis },
                { status: healthy ? 200 : 503 }
            );
        },
    });
    logger.info(`Worker health on http://localhost:${server.port}/health`);
    return server;
}

export async function startQueueService(queueName: string) {
    const parsedQueueName = parseQueueName(queueName);
    const queue = queues[parsedQueueName];

    // Before the worker starts: an invalid schedule fails startup instead of every cron tick.
    await syncSchedules({
        queueName: parsedQueueName,
        queue: queue.queue,
        schedules: schedules[parsedQueueName],
        schemas: queueJobSchemas[parsedQueueName],
    });

    const worker = new DefaultWorker(parsedQueueName, {
        connection: { url: config.REDIS_URL },
        concurrency: config.WORKER_CONCURRENCY,
    });

    const health = config.WORKER_HEALTH_PORT
        ? serveHealth(config.WORKER_HEALTH_PORT, worker, () => queue.ping())
        : null;

    errorHandler.registerShutdownHandler(async () => {
        // Stop taking jobs and let active ones finish, then close every connection. Jobs still
        // running after WORKER_SHUTDOWN_TIMEOUT_MS are abandoned (BullMQ retries them once their
        // lock expires) and the process exits 1.
        await health?.stop();
        await worker.close();
        await closeServices();
    });
    errorHandler.listenToErrorEvents({ shutdownTimeoutMs: config.WORKER_SHUTDOWN_TIMEOUT_MS });

    return parsedQueueName;
}
