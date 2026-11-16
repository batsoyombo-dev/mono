import { Elysia } from "elysia";

import { updateProfileSchema } from "@mono/services/user/schema";
import type { UserOperations } from "@mono/services/user/types";

import type { AuthHandler } from "./auth-handler";
import { getAuthorizedSessionUserId } from "./session-guard";
import { success } from "../utils/response";

type UserControllerOptions = {
    auth: Pick<AuthHandler, "getSession">;
    users: UserOperations;
};

export function createUserController({ auth, users }: UserControllerOptions) {
    return (
        new Elysia({ prefix: "/users", name: "Users", detail: { tags: ["users"] } })
            // derive runs after the body is parsed but before it is validated: an unauthenticated
            // call gets 401 rather than 422 (a malformed JSON body is still a 400 first).
            .derive(async ({ request }) => ({
                actorUserId: await getAuthorizedSessionUserId(auth, request),
            }))
            .get("/me", async ({ actorUserId }) =>
                success({ user: await users.getProfile({ actorUserId }) })
            )
            .patch(
                "/me",
                async ({ actorUserId, body }) =>
                    success({ user: await users.updateProfile({ ...body, actorUserId }) }),
                { body: updateProfileSchema }
            )
    );
}
