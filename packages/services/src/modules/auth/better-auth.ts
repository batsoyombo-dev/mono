import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import { prisma } from "@mono/database";
import { config } from "@mono/global-config";
import { slugify } from "@mono/utils";

import { queuePasswordResetEmail, queueVerificationEmail } from "./handler";

type AuthOptions = {
    /** Mount path; must match the controller prefix the handler is served under. */
    basePath: string;
    cookiePrefix: string;
    disableSignUp: boolean;
};

/**
 * Builds a Better Auth instance. Call it again with a different basePath and cookiePrefix to
 * add an isolated auth surface (for example an admin panel with sign-up disabled).
 */
export function createAuth({ basePath, cookiePrefix, disableSignUp }: AuthOptions) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = config;

    return betterAuth({
        appName: config.APP_NAME,
        baseURL: config.BASE_URL,
        basePath,
        secret: config.BETTER_AUTH_SECRET,
        trustedOrigins: config.CORS_ORIGINS,
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
                await queueVerificationEmail({
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
                await queuePasswordResetEmail({
                    email: user.email,
                    name: user.name,
                    resetUrl: url,
                });
            },
        },
        socialProviders:
            GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
                ? {
                      google: {
                          clientId: GOOGLE_CLIENT_ID,
                          clientSecret: GOOGLE_CLIENT_SECRET,
                      },
                  }
                : undefined,
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

export const auth = createAuth({
    basePath: "/api/v1/auth",
    cookiePrefix: slugify(config.APP_NAME),
    disableSignUp: false,
});
