import { describe, expect, test } from "bun:test";
import { betterAuth } from "better-auth";

import type { AuthDeps } from "../src/modules/auth/options";
import { authOptions } from "../src/modules/auth/options";

const surface = { basePath: "/api/v1/auth", cookiePrefix: "test", disableSignUp: false };

function buildWithRateLimit(trustedProxies: string[]) {
    const keys: string[] = [];
    const deps: AuthDeps = {
        // Never reached: the rate limiter runs before the handler touches the database.
        prisma: {} as AuthDeps["prisma"],
        emails: {
            queueVerificationEmail: () => Promise.resolve(),
            queuePasswordResetEmail: () => Promise.resolve(),
        },
        rateLimitStore: {
            consumeRateLimit: (key) => {
                keys.push(key);
                // Deny, so the request stops at the limiter.
                return Promise.resolve({ allowed: false, count: 1, remaining: 0, resetInMs: 1000 });
            },
        },
        appName: "Test",
        baseUrl: "http://localhost:3000",
        secret: "x".repeat(32),
        trustedOrigins: [],
        trustedProxies,
    };
    const options = authOptions(surface, deps);
    const auth = betterAuth({ ...options, rateLimit: { ...options.rateLimit, enabled: true } });
    return { auth, keys };
}

const signIn = (forwardedFor: string) =>
    new Request("http://localhost:3000/api/v1/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
        body: JSON.stringify({ email: "a@example.com", password: "password123" }),
    });

describe("auth options", () => {
    test("passes TRUSTED_PROXIES to Better Auth", () => {
        const { auth } = buildWithRateLimit(["10.0.0.0/8"]);
        expect(auth.options.advanced.ipAddress.trustedProxies).toEqual(["10.0.0.0/8"]);
    });

    test("rate limits by the client IP behind a trusted proxy", async () => {
        const { auth, keys } = buildWithRateLimit(["10.0.0.0/8"]);

        const response = await auth.handler(signIn("203.0.113.7, 10.1.2.3"));

        expect(response.status).toBe(429);
        expect(keys).toHaveLength(1);
        expect(keys[0]).toContain("203.0.113.7");
        expect(keys[0]).not.toContain("10.1.2.3");
    });

    test("without trusted proxies, a multi-hop header yields no client IP", async () => {
        const { auth, keys } = buildWithRateLimit([]);

        await auth.handler(signIn("203.0.113.7, 10.1.2.3"));

        expect(keys).toHaveLength(1);
        expect(keys[0]).not.toContain("203.0.113.7");
    });
});
