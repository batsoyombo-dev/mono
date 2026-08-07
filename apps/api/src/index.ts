import "dotenv/config";
import { createServer } from "node:http";

import { errorHandler } from "@mono/error-handling";
import { config } from "@mono/global-config";
import { logger } from "@mono/logger";

const allowedOrigins = new Set(
    config.CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
);

const server = createServer((request, response) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
    }

    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        response.end();
        return;
    }

    if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
});

errorHandler.listenToErrorEvents(server);

server.listen(config.SERVER_PORT, () => {
    logger.info(`API listening on port ${config.SERVER_PORT}`);
});
