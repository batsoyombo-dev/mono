import { Elysia } from "elysia";

import type { AuthHandler } from "./auth-handler";

export function createAuthController(auth: AuthHandler) {
    return (
        new Elysia({
            prefix: "/auth",
            name: "Auth",
            detail: { tags: ["auth"] },
        })
            // Custom auth routes belong before Better Auth's catch-all handler.
            .all("/*", ({ request }) => auth.handler(request))
    );
}
