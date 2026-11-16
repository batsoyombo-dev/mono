import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

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
    appName: string;
    /** Public origin of the API, used for callback and email links. */
    baseUrl: string;
    secret: string;
    trustedOrigins: string[];
    /** Enables Google sign-in when set. */
    google?: { clientId: string; clientSecret: string };
};

function defaultAuthDeps(): AuthDeps {
    const { BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env.auth;

    return {
        prisma,
        emails: authEmails,
        appName: env.app.APP_NAME,
        baseUrl: env.app.BASE_URL,
        secret: BETTER_AUTH_SECRET,
        trustedOrigins: env.app.CORS_ORIGINS,
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
        appName,
        baseUrl,
        secret,
        trustedOrigins,
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
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;

export const auth: Auth = createAuth({
    basePath: "/api/v1/auth",
    cookiePrefix: slugify(env.app.APP_NAME),
    disableSignUp: false,
});
