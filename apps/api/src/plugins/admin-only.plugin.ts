import type { AnyElysia } from "elysia";
import { Elysia } from "elysia";

import type { AdminAccess } from "../controllers/session-guard";
import { getAuthorizedAdminUserId } from "../controllers/session-guard";

/**
 * Wraps a plugin so every route it registers requires an admin session (401 without a session,
 * 403 for a non-admin). Use it to mount third-party apps, such as the queue dashboard.
 *
 * The check is a lifecycle hook on the matched routes, not a URL prefix test in `onRequest`:
 * Elysia derives the routed path from the raw URL itself, so a URL that parses to a different
 * pathname (`http://x/zz/admin/queues` routes to `/admin/queues`) cannot slip past it. It runs
 * in `transform`, after body parsing and before validation and the handler.
 */
export function adminOnly(access: AdminAccess, plugin: AnyElysia) {
    // No `name`: a named plugin is deduplicated, which would drop a second wrapped plugin.
    return new Elysia()
        .onTransform(async ({ request }) => {
            await getAuthorizedAdminUserId(access, request);
        })
        .use(plugin);
}
