import { Elysia } from "elysia";

import type { QueueOperations } from "@mono/services/queue/types";
import type { UserOperations } from "@mono/services/user/types";

import type { AuthHandler } from "./auth-handler";
import { createAuthController } from "./auth.controller";
import { health } from "./health.controller";
import { createQueueController } from "./queue.controller";
import { createUserController } from "./user.controller";

type ApiDependencies = {
    auth?: AuthHandler;
    users?: UserOperations;
    queues?: QueueOperations;
    /** Lowercase emails allowed to use admin routes. Empty means no admins. */
    adminEmails?: readonly string[];
};

/**
 * Mounts every versioned route. Dependencies are injected so tests can pass fakes;
 * a controller is only mounted when the services it needs are provided.
 */
export function createApi({ auth, users, queues, adminEmails = [] }: ApiDependencies = {}) {
    const api = new Elysia({
        prefix: "/api/v1",
        name: "Api",
    });

    if (!auth) return api;

    api.use(createAuthController(auth));

    if (auth.getSession && users) {
        api.use(createUserController({ auth: { getSession: auth.getSession }, users }));
    }

    if (auth.getSession && queues) {
        api.use(
            createQueueController({ auth: { getSession: auth.getSession }, adminEmails, queues })
        );
    }

    return api;
}

export { health };
export type { ApiDependencies, AuthHandler };
export type { AuthSession } from "./auth-handler";
export type { AdminAccess } from "./session-guard";
export { getAuthorizedAdminUserId } from "./session-guard";
