import { Elysia } from "elysia";

import type { NoteOperations } from "@mono/services/notes/types";
import type { QueueOperations } from "@mono/services/queue/types";
import type { UserOperations } from "@mono/services/user/types";

import type { AuthHandler } from "./auth-handler";
import { createAuthController } from "./auth.controller";
import { createNoteController } from "./note.controller";
import { createQueueController } from "./queue.controller";
import { createUserController } from "./user.controller";

/**
 * Everything the versioned API needs. Every field is required, so forgetting to wire a new
 * service in `src/index.ts` is a type error rather than a silently missing route. Tests pass
 * fakes (see tests/helpers.ts).
 */
type ApiDependencies = {
    auth: AuthHandler;
    users: UserOperations;
    notes: NoteOperations;
    queues: QueueOperations;
    /** Lowercase emails allowed to use admin routes. Empty means no admins. */
    adminEmails: readonly string[];
};

/** Mounts every versioned route under /api/v1. */
export function createApi({ auth, users, notes, queues, adminEmails }: ApiDependencies) {
    return new Elysia({ prefix: "/api/v1", name: "Api" })
        .use(createAuthController(auth))
        .use(createUserController({ auth, users }))
        .use(createNoteController({ auth, notes }))
        .use(createQueueController({ auth, adminEmails, queues }));
}

export type { ApiDependencies, AuthHandler };
export type { AuthSession } from "./auth-handler";
export type { ReadinessChecks } from "./health.controller";
export { createHealthController } from "./health.controller";
export type { AdminAccess } from "./session-guard";
export { getAuthorizedAdminUserId } from "./session-guard";
