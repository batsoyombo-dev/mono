import { cors } from "@elysia/cors";
import { Elysia } from "elysia";

import type { ApiDependencies } from "./controllers";
import { createApi, health } from "./controllers";
import { errorResponsePlugin } from "./plugins/error-response.plugin";

type CreateAppOptions = ApiDependencies & {
    allowedOrigins: string[];
};

export function createApp({ allowedOrigins, ...dependencies }: CreateAppOptions) {
    return new Elysia({ name: "App" })
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
}
