import { prisma } from "@mono/database";
import { errorHandler } from "@mono/error-handling";
import { config } from "@mono/global-config";
import { logger } from "@mono/logger";
import { auth, defaultQueue, userService } from "@mono/services";

import { createApp } from "./app";

const app = createApp({
    allowedOrigins: config.CORS_ORIGINS,
    auth: {
        handler: auth.handler,
        getSession: (headers) => auth.api.getSession({ headers }),
    },
    users: userService,
});

errorHandler.registerShutdownHandler(async () => {
    await app.stop();
    await defaultQueue.close();
    await prisma.$disconnect();
});
errorHandler.listenToErrorEvents();

app.listen(config.SERVER_PORT);

logger.info(`API listening on ${config.BASE_URL}`);
