import { z } from "zod";

import { commaSeparated, defineEnv, port } from "@mono/env";

/**
 * The API's environment: every shared group plus API-only variables, validated together.
 * Entry points import this first, so a bad .env fails before any package loads.
 */
export const config = defineEnv("api", {
    extend: {
        SERVER_PORT: port.default(3000),
        /** Verified users with these emails can use the queue admin API and dashboard. */
        ADMIN_EMAILS: commaSeparated(z.string().toLowerCase().pipe(z.email())).default([]),
    },
});
