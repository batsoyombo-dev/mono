import { cache } from "@mono/cache";
import { prisma } from "@mono/database";
import { env } from "@mono/env";
import { slugify } from "@mono/utils";

import { authEmails } from "./handler";
import type { AuthDeps, AuthSurface } from "./options";
import { buildAuth } from "./options";

export type { AuthDeps, AuthSurface } from "./options";

function defaultAuthDeps(): AuthDeps {
    const { BETTER_AUTH_SECRET, TRUSTED_PROXIES, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } =
        env.auth;

    return {
        prisma,
        emails: authEmails,
        rateLimitStore: cache.namespace("auth:"),
        appName: env.app.APP_NAME,
        baseUrl: env.app.BASE_URL,
        secret: BETTER_AUTH_SECRET,
        trustedOrigins: env.app.CORS_ORIGINS,
        trustedProxies: TRUSTED_PROXIES,
        google:
            GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
                ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET }
                : undefined,
    };
}

/**
 * Builds a Better Auth instance. Call it again with a different basePath and cookiePrefix to
 * add an isolated auth surface (for example an admin panel with sign-up disabled).
 */
export function createAuth(surface: AuthSurface, deps: AuthDeps = defaultAuthDeps()) {
    return buildAuth(surface, deps);
}

export type Auth = ReturnType<typeof createAuth>;

export const auth: Auth = createAuth({
    basePath: "/api/v1/auth",
    cookiePrefix: slugify(env.app.APP_NAME),
    disableSignUp: false,
});
