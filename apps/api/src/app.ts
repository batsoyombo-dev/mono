import { cors } from "@elysia/cors";
import type { AnyElysia } from "elysia";
import { Elysia } from "elysia";

import type { ApiDependencies } from "./controllers";
import { createApi, health } from "./controllers";
import { errorResponsePlugin } from "./plugins/error-response.plugin";

type CreateAppOptions = ApiDependencies & {
    allowedOrigins: string[];
    /** Extra mounted apps that need real infrastructure, such as the queue dashboard. */
    plugins?: AnyElysia[];
};

export function createApp({ allowedOrigins, plugins = [], ...dependencies }: CreateAppOptions) {
    const app = new Elysia({ name: "App" })
        .use(
            cors({
                origin: allowedOrigins,
                credentials: true,
                allowedHeaders: ["Content-Type", "Authorization"],
                methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            })
        )
        .use(errorResponsePlugin)
        .use(health)
        .use(createApi(dependencies));

    for (const plugin of plugins) app.use(plugin);

    return app;
}
