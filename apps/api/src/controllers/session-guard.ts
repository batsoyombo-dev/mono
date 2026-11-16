import { UnauthorizedError } from "@mono/error-handling";

import type { AuthHandler } from "./auth-handler";

function getActorId(userId: string | number): number {
    const actorId = typeof userId === "number" ? userId : Number(userId);
    if (!Number.isSafeInteger(actorId) || actorId <= 0) {
        throw new UnauthorizedError();
    }

    return actorId;
}

/**
 * Confirms the request carries an authenticated session and returns the user id.
 * Resource ownership checks belong inside each service handler.
 */
export async function getAuthorizedSessionUserId(
    auth: Required<Pick<AuthHandler, "getSession">>,
    request: Request
): Promise<number> {
    const session = await auth.getSession(request.headers);
    if (!session) throw new UnauthorizedError();

    return getActorId(session.user.id);
}
