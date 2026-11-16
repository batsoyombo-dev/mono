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
    const getActorUserId = (request: Request) => getAuthorizedSessionUserId(auth, request);

    return new Elysia({
        prefix: "/users",
        name: "Users",
        detail: { tags: ["users"] },
    })
        .get("/me", async ({ request }) =>
            success({
                user: await users.getProfile({ actorUserId: await getActorUserId(request) }),
            })
        )
        .patch(
            "/me",
            async ({ request, body }) =>
                success({
                    user: await users.updateProfile({
                        ...body,
                        actorUserId: await getActorUserId(request),
                    }),
                }),
            { body: updateProfileSchema }
        );
}
