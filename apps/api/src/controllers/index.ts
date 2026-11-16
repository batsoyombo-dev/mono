import { Elysia } from "elysia";

import type { UserOperations } from "@mono/services/user/types";

import type { AuthHandler } from "./auth-handler";
import { createAuthController } from "./auth.controller";
import { health } from "./health.controller";
import { createUserController } from "./user.controller";

type ApiDependencies = {
    auth?: AuthHandler;
    users?: UserOperations;
};

/**
 * Mounts every versioned route. Dependencies are injected so tests can pass fakes;
 * a controller is only mounted when the services it needs are provided.
 */
export function createApi({ auth, users }: ApiDependencies = {}) {
    const api = new Elysia({
        prefix: "/api/v1",
        name: "Api",
    });

    if (!auth) return api;

    api.use(createAuthController(auth));

    if (auth.getSession && users) {
        api.use(createUserController({ auth: { getSession: auth.getSession }, users }));
    }

    return api;
}

export { health };
export type { ApiDependencies, AuthHandler };
export type { AuthSession } from "./auth-handler";
