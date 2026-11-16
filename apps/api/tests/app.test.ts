import { describe, expect, test } from "bun:test";

import type { UserOperations } from "@mono/services/user/types";

import { createApp } from "../src/app";
import type { AuthSession } from "../src/controllers";

const allowedOrigin = "https://app.example.com";

const profile = {
    id: 42,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function createTestApp(options: { session?: AuthSession | null; users?: UserOperations } = {}) {
    return createApp({
        allowedOrigins: [allowedOrigin],
        auth: {
            handler: async () => new Response("auth"),
            getSession: async () => options.session ?? null,
        },
        users: options.users,
    });
}

const fakeUsers = (calls: unknown[] = []): UserOperations => ({
    getProfile: async (input) => {
        calls.push(input);
        return profile;
    },
    updateProfile: async (input) => {
        calls.push(input);
        return { ...profile, name: input.name ?? profile.name };
    },
});

describe("API", () => {
    test("returns the health response envelope", async () => {
        const response = await createTestApp().handle(new Request("http://localhost/health"));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            status: 200,
            data: { status: "ok" },
        });
    });

    test("allows configured CORS origins", async () => {
        const response = await createTestApp().handle(
            new Request("http://localhost/health", { headers: { Origin: allowedOrigin } })
        );

        expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
        expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    });

    test("forwards auth routes to the auth handler", async () => {
        const response = await createTestApp().handle(
            new Request("http://localhost/api/v1/auth/get-session")
        );

        expect(await response.text()).toBe("auth");
    });

    test("serves the profile of the authenticated user", async () => {
        const calls: unknown[] = [];
        const app = createTestApp({ session: { user: { id: "42" } }, users: fakeUsers(calls) });

        const response = await app.handle(new Request("http://localhost/api/v1/users/me"));

        expect(response.status).toBe(200);
        expect(calls).toEqual([{ actorUserId: 42 }]);
        expect(await response.json()).toMatchObject({
            success: true,
            data: { user: { id: 42, email: "ada@example.com" } },
        });
    });

    test("rejects unauthenticated profile requests", async () => {
        const app = createTestApp({ session: null, users: fakeUsers() });

        const response = await app.handle(new Request("http://localhost/api/v1/users/me"));

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            success: false,
            status: 401,
            error: { message: "Unauthorized" },
        });
    });

    test("validates the profile update body", async () => {
        const calls: unknown[] = [];
        const app = createTestApp({ session: { user: { id: 42 } }, users: fakeUsers(calls) });
        const patch = (body: unknown) =>
            app.handle(
                new Request("http://localhost/api/v1/users/me", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                })
            );

        const valid = await patch({ name: "Grace" });
        const invalid = await patch({ name: "" });

        expect(valid.status).toBe(200);
        expect(await valid.json()).toMatchObject({ data: { user: { name: "Grace" } } });
        expect(invalid.status).toBe(422);
        expect(calls).toEqual([{ name: "Grace", actorUserId: 42 }]);
    });

    test("rejects a malformed JSON body as a client error", async () => {
        const app = createTestApp({ session: { user: { id: 42 } }, users: fakeUsers() });

        const response = await app.handle(
            new Request("http://localhost/api/v1/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: "{bad",
            })
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            success: false,
            status: 400,
            error: { message: "Malformed request body" },
        });
    });

    test("returns the failure envelope for unknown routes", async () => {
        const response = await createTestApp().handle(new Request("http://localhost/missing"));

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            success: false,
            status: 404,
            error: { message: "Not found" },
        });
    });
});
