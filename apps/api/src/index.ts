import { prisma } from "@mono/database";
import { errorHandler } from "@mono/error-handling";
import { config } from "@mono/global-config";
import { logger } from "@mono/logger";
import { auth, queues, queueService, userService } from "@mono/services";

import { createQueueDashboard, QUEUE_DASHBOARD_PATH } from "./admin/queue-dashboard";
import { createApp } from "./app";

const session = {
    handler: auth.handler,
    getSession: (headers: Headers) => auth.api.getSession({ headers }),
};

const app = createApp({
    allowedOrigins: config.CORS_ORIGINS,
    auth: session,
    users: userService,
    queues: queueService,
    adminEmails: config.ADMIN_EMAILS,
    plugins: [await createQueueDashboard({ auth: session, adminEmails: config.ADMIN_EMAILS })],
});

errorHandler.registerShutdownHandler(async () => {
    await app.stop();
    await Promise.all(Object.values(queues).map((queue) => queue.close()));
    await prisma.$disconnect();
});
errorHandler.listenToErrorEvents();

app.listen(config.SERVER_PORT);

logger.info(`API listening on ${config.BASE_URL}`);
logger.info(`Queue dashboard on ${config.BASE_URL}${QUEUE_DASHBOARD_PATH}`);
