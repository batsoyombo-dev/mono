import { ForbiddenError, UnauthorizedError } from "@mono/error-handling";

import type { AuthHandler } from "./auth-handler";

type SessionReader = Pick<AuthHandler, "getSession">;

/** Who may use admin surfaces: verified users whose email is in `adminEmails` (lowercase). */
export type AdminAccess = {
    auth: SessionReader;
    adminEmails: readonly string[];
};

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
    auth: SessionReader,
    request: Request
): Promise<number> {
    const session = await auth.getSession(request.headers);
    if (!session) throw new UnauthorizedError();

    return getActorId(session.user.id);
}

/** Like `getAuthorizedSessionUserId`, but also requires an admin (see `AdminAccess`). */
export async function getAuthorizedAdminUserId(
    { auth, adminEmails }: AdminAccess,
    request: Request
): Promise<number> {
    const session = await auth.getSession(request.headers);
    if (!session) throw new UnauthorizedError();

    const email = session.user.email.toLowerCase();
    if (!session.user.emailVerified || !adminEmails.includes(email)) {
        throw new ForbiddenError("Admin access required");
    }

    return getActorId(session.user.id);
}
