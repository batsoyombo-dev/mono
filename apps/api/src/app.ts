import { cors } from "@elysia/cors";
import { openapi } from "@elysia/openapi";
import type { AnyElysia } from "elysia";
import { Elysia } from "elysia";
import { z } from "zod";

import type { ApiDependencies, ReadinessChecks } from "./controllers";
import { createApi, createHealthController } from "./controllers";
import { errorResponsePlugin } from "./plugins/error-response.plugin";
import { REQUEST_ID_HEADER, requestContextPlugin } from "./plugins/request-context.plugin";

type CreateAppOptions = ApiDependencies & {
    allowedOrigins: string[];
    /** Checks behind `GET /health/ready` (database, Redis, ...). */
    readiness: ReadinessChecks;
    /** How long each readiness check may take (default 3 s). */
    readinessTimeoutMs?: number;
    /** Serve OpenAPI docs at /openapi (UI) and /openapi/json. Off in production by default. */
    docs?: boolean;
    /** Extra mounted apps that need real infrastructure, such as the queue dashboard. */
    plugins?: AnyElysia[];
};

export function createApp({
    allowedOrigins,
    readiness,
    readinessTimeoutMs,
    docs = false,
    plugins = [],
    ...dependencies
}: CreateAppOptions) {
    const app = new Elysia({ name: "App" })
        .use(requestContextPlugin)
        .use(
            cors({
                origin: allowedOrigins,
                credentials: true,
                allowedHeaders: ["Content-Type", "Authorization", REQUEST_ID_HEADER],
                exposeHeaders: [REQUEST_ID_HEADER],
                methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            })
        )
        .use(errorResponsePlugin);

    if (docs) {
        app.use(
            openapi({
                documentation: { info: { title: "API", version: "1.0.0" } },
                // Route schemas are zod; describe what clients send (input), and render types
                // JSON cannot express (z.date()) as unconstrained instead of warning.
                mapJsonSchema: {
                    zod: (schema: z.ZodType) =>
                        z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
                },
                exclude: { paths: [/^\/admin\//, /^\/api\/v1\/auth\//] },
            })
        );
    }

    app.use(createHealthController(readiness, { timeoutMs: readinessTimeoutMs })).use(
        createApi(dependencies)
    );

    for (const plugin of plugins) app.use(plugin);

    return app;
}
