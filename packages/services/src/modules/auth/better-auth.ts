import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import type { RedisCache } from "@mono/cache";
import { cache } from "@mono/cache";
import type { PrismaClient } from "@mono/database";
import { prisma } from "@mono/database";
import { env } from "@mono/env";
import { slugify } from "@mono/utils";

import { authEmails } from "./handler";
import type { AuthEmails } from "./types";

/** Where an auth instance is mounted and who may sign up there. */
export type AuthSurface = {
    /** Mount path; must match the controller prefix the handler is served under. */
    basePath: string;
    cookiePrefix: string;
    disableSignUp: boolean;
};

/** What every auth instance shares. Defaults to the app's database, emails and `env`. */
export type AuthDeps = {
    prisma: PrismaClient;
    emails: AuthEmails;
    /** Shared store for rate-limit counters, so limits hold across API instances. */
    rateLimitStore: Pick<RedisCache, "consumeRateLimit">;
    appName: string;
    /** Public origin of the API, used for callback and email links. */
    baseUrl: string;
    secret: string;
    trustedOrigins: string[];
    /**
     * IPs or CIDR ranges of the reverse proxies in front of the API. The client IP (used for
     * rate limits and stored on sessions) is the first `X-Forwarded-For` hop, read from the
     * right, that is not one of these. Empty: only a single-entry header is trusted, so a
     * request that went through a proxy chain gets no client IP.
     */
    trustedProxies: string[];
    /** Enables Google sign-in when set. */
    google?: { clientId: string; clientSecret: string };
};

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
export function createAuth(
    { basePath, cookiePrefix, disableSignUp }: AuthSurface,
    {
        prisma,
        emails,
        rateLimitStore,
        appName,
        baseUrl,
        secret,
        trustedOrigins,
        trustedProxies,
        google,
    }: AuthDeps = defaultAuthDeps()
) {
    return betterAuth({
        appName,
        baseURL: baseUrl,
        basePath,
        secret,
        trustedOrigins,
        database: prismaAdapter(prisma, {
            provider: "postgresql",
        }),
        advanced: {
            database: {
                generateId: "serial",
            },
            cookiePrefix,
            ipAddress: {
                // X-Forwarded-For is the default header. Any client can send it, so only the
                // hops appended by the proxies listed here are skipped (see AuthDeps).
                trustedProxies,
            },
        },
        emailVerification: {
            expiresIn: 60 * 60,
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => {
                await emails.queueVerificationEmail({
                    email: user.email,
                    name: user.name,
                    verificationUrl: url,
                });
            },
        },
        emailAndPassword: {
            enabled: true,
            disableSignUp,
            requireEmailVerification: true,
            minPasswordLength: 8,
            maxPasswordLength: 128,
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }) => {
                await emails.queuePasswordResetEmail({
                    email: user.email,
                    name: user.name,
                    resetUrl: url,
                });
            },
        },
        socialProviders: google ? { google } : undefined,
        account: {
            encryptOAuthTokens: true,
            accountLinking: {
                enabled: true,
                trustedProviders: ["google"],
            },
        },
        session: {
            expiresIn: 7 * 24 * 60 * 60,
            updateAge: 24 * 60 * 60,
            // A signed cookie caches the session, so most requests skip the sessions query.
            // Trade-off: a revoked session keeps working for up to maxAge seconds.
            cookieCache: { enabled: true, maxAge: 5 * 60 },
        },
        // Enabled in production by default. Counters live in Redis, not process memory, so
        // the limit is shared by every API instance. Limits are per client IP, read from
        // X-Forwarded-For with `trustedProxies` (TRUSTED_PROXIES). Behind proxies, list their
        // addresses there: otherwise a header with several hops yields no client IP, and all
        // such requests share one bucket. Clients that reach the API directly can set the
        // header themselves, so only expose the API through the proxy.
        rateLimit: {
            customStorage: {
                async consume(key, { window, max }) {
                    const result = await rateLimitStore.consumeRateLimit(key, {
                        windowMs: window * 1000,
                        max,
                    });
                    return {
                        allowed: result.allowed,
                        retryAfter: result.allowed ? null : Math.ceil(result.resetInMs / 1000),
                    };
                },
            },
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;

export const auth: Auth = createAuth({
    basePath: "/api/v1/auth",
    cookiePrefix: slugify(env.app.APP_NAME),
    disableSignUp: false,
});
