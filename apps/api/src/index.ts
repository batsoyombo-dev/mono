// Validate the environment before any package that reads it is loaded.
import { config } from "./config";

import { cache } from "@mono/cache";
import { prisma } from "@mono/database";
import { errorHandler } from "@mono/error-handling";
import { logger } from "@mono/logger";
import { auth } from "@mono/services/auth";
import { closeServices } from "@mono/services/lifecycle";
import { noteService } from "@mono/services/notes";
import { queueService } from "@mono/services/queue";
import { defaultQueue } from "@mono/services/queues";
import { userService } from "@mono/services/user";

import { createQueueDashboard, QUEUE_DASHBOARD_PATH } from "./admin/queue-dashboard";
import { createApp } from "./app";

const session = {
    handler: auth.handler,
    getSession: (headers: Headers) => auth.api.getSession({ headers }),
};

const docs = config.API_DOCS ?? config.NODE_ENV !== "production";

const app = createApp({
    allowedOrigins: config.CORS_ORIGINS,
    auth: session,
    users: userService,
    notes: noteService,
    queues: queueService,
    adminEmails: config.ADMIN_EMAILS,
    readiness: {
        database: () => prisma.$queryRaw`SELECT 1`,
        cache: () => cache.ping(),
        queue: () => defaultQueue.ping(),
    },
    docs,
    plugins: [await createQueueDashboard({ auth: session, adminEmails: config.ADMIN_EMAILS })],
});

errorHandler.registerShutdownHandler(async () => {
    await app.stop();
    await closeServices();
});
errorHandler.listenToErrorEvents();

app.listen(config.SERVER_PORT);

logger.info(`API listening on ${config.BASE_URL}`);
logger.info(`Queue dashboard on ${config.BASE_URL}${QUEUE_DASHBOARD_PATH}`);
if (docs) {
    logger.info(`API docs on ${config.BASE_URL}/openapi`);
}
