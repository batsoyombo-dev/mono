import { describe, expect, spyOn, test } from "bun:test";

import { z } from "zod";

import { logger } from "@mono/logger";

import type { UserOperations } from "@mono/services/user/types";

import type { AuthSession } from "../src/controllers";
import type { TestAppOptions } from "./helpers";
import { createTestApp as createFakedApp } from "./helpers";

const allowedOrigin = "https://app.example.com";

const profile = {
    id: 42,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function createTestApp(
    options: { session?: AuthSession | null; users?: UserOperations } & Partial<TestAppOptions> = {}
) {
    const { session, ...overrides } = options;
    return createFakedApp({
        allowedOrigins: [allowedOrigin],
        auth: {
            handler: async () => new Response("auth"),
            getSession: async () => session ?? null,
        },
        ...overrides,
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
        const app = createTestApp({
            session: { user: { id: "42", email: "ada@example.com", emailVerified: true } },
            users: fakeUsers(calls),
        });

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
        const app = createTestApp({
            session: { user: { id: 42, email: "ada@example.com", emailVerified: true } },
            users: fakeUsers(calls),
        });
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
        expect(await invalid.json()).toEqual({
            success: false,
            status: 422,
            error: {
                message: "Validation failed",
                issues: [{ path: "name", message: expect.any(String) }],
            },
        });
        expect(calls).toEqual([{ name: "Grace", actorUserId: 42 }]);
    });

    test("checks the session before validating the body", async () => {
        const calls: unknown[] = [];
        const app = createTestApp({ session: null, users: fakeUsers(calls) });
        const patch = (body: string) =>
            app.handle(
                new Request("http://localhost/api/v1/users/me", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body,
                })
            );

        // An invalid body from an anonymous caller is a 401, not a 422.
        const invalid = await patch(JSON.stringify({ name: "" }));
        expect(invalid.status).toBe(401);
        // Body parsing runs before the session check, so malformed JSON is still a 400.
        expect((await patch("{bad")).status).toBe(400);
        expect(calls).toEqual([]);
    });

    test("rejects a session whose user id is not a positive integer", async () => {
        for (const id of ["abc", "", "1.5", "-3", 0, "9007199254740993"]) {
            const app = createTestApp({
                session: { user: { id, email: "ada@example.com", emailVerified: true } },
                users: fakeUsers(),
            });

            const response = await app.handle(new Request("http://localhost/api/v1/users/me"));

            expect(response.status).toBe(401);
        }
    });

    test("rejects a malformed JSON body as a client error", async () => {
        const app = createTestApp({
            session: { user: { id: 42, email: "ada@example.com", emailVerified: true } },
            users: fakeUsers(),
        });

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

    test("maps errors thrown inside services to client errors, never a leaked 500", async () => {
        const session = { user: { id: 42, email: "ada@example.com", emailVerified: true } };
        const throwing = (error: unknown): UserOperations => ({
            getProfile: async () => {
                throw error;
            },
            updateProfile: async () => profile,
        });
        const get = (error: unknown) =>
            createTestApp({ session, users: throwing(error) }).handle(
                new Request("http://localhost/api/v1/users/me")
            );

        // A service's own schema.parse failing (zod) is a 422, not a 500.
        const zod = await get(z.object({ name: z.string() }).safeParse({}).error);
        expect(zod.status).toBe(422);
        expect(await zod.json()).toMatchObject({
            error: { message: "Validation failed", issues: [{ path: "name" }] },
        });

        // Prisma errors keep their meaning.
        const prisma = (code: string) =>
            Object.assign(new Error("prisma"), { name: "PrismaClientKnownRequestError", code });
        expect((await get(prisma("P2002"))).status).toBe(409);
        expect((await get(prisma("P2025"))).status).toBe(404);

        // Unknown errors are a generic 500 without the internal message (logged, not sent).
        const errorLog = spyOn(logger, "error").mockImplementation(() => logger);
        let crash: Response;
        try {
            crash = await get(new Error("connection string postgres://secret"));
            expect(errorLog).toHaveBeenCalledTimes(1);
        } finally {
            errorLog.mockRestore();
        }
        expect(crash.status).toBe(500);
        expect(await crash.json()).toEqual({
            success: false,
            status: 500,
            error: { message: "Internal server error" },
        });
    });

    test("sends a request id, reusing a valid incoming one", async () => {
        const app = createTestApp();

        const generated = await app.handle(new Request("http://localhost/health"));
        expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);

        const forwarded = await app.handle(
            new Request("http://localhost/missing", { headers: { "x-request-id": "abc-123" } })
        );
        expect(forwarded.status).toBe(404);
        expect(forwarded.headers.get("x-request-id")).toBe("abc-123");
    });

    test("logs one line per request with the status actually sent", async () => {
        const info = spyOn(logger, "info").mockImplementation(() => logger);
        try {
            const headers = (id: string) => ({ headers: { "x-request-id": id } });
            await createTestApp().handle(
                new Request("http://localhost/api/v1/users/me", headers("log-test-me"))
            );
            await createTestApp().handle(
                new Request("http://localhost/health", headers("log-test-health"))
            );
            // onAfterResponse runs after the response is returned.
            await Bun.sleep(5);

            // winston's overloads type calls as [object]; they are (message, meta) here.
            const calls = info.mock.calls as unknown as [string, Record<string, unknown>?][];
            const logged = (id: string) =>
                calls.filter(
                    ([message, meta]) => message === "HTTP request" && meta?.requestId === id
                );
            expect(logged("log-test-me")).toEqual([
                [
                    "HTTP request",
                    {
                        requestId: "log-test-me",
                        method: "GET",
                        path: "/api/v1/users/me",
                        status: 401,
                        durationMs: expect.any(Number),
                    },
                ],
            ]);
            // Health checks are not logged.
            expect(logged("log-test-health")).toEqual([]);
        } finally {
            info.mockRestore();
        }
    });

    test("logs the routed path, and the URL path when they differ", async () => {
        const info = spyOn(logger, "info").mockImplementation(() => logger);
        try {
            // Elysia routes this to /api/v1/users/me although its parsed pathname is /zz/....
            await createTestApp().handle(
                new Request("http://x/zz/api/v1/users/me", {
                    headers: { "x-request-id": "log-test-short-host" },
                })
            );
            await Bun.sleep(5);

            const calls = info.mock.calls as unknown as [string, Record<string, unknown>?][];
            expect(calls.find(([, meta]) => meta?.requestId === "log-test-short-host")).toEqual([
                "HTTP request",
                expect.objectContaining({
                    path: "/api/v1/users/me",
                    urlPath: "/zz/api/v1/users/me",
                    status: 401,
                }),
            ]);
        } finally {
            info.mockRestore();
        }
    });

    test("reports readiness per dependency without leaking errors", async () => {
        const ready = createTestApp({ readiness: { database: async () => {} } });
        const notReady = createTestApp({
            readiness: {
                database: async () => {},
                cache: async () => {
                    throw new Error("connect ECONNREFUSED redis://:secret@10.0.0.5:6379");
                },
            },
        });

        const ok = await ready.handle(new Request("http://localhost/health/ready"));
        expect(ok.status).toBe(200);
        expect(await ok.json()).toMatchObject({
            data: { status: "ready", checks: { database: "ok" } },
        });

        const errorLog = spyOn(logger, "error").mockImplementation(() => logger);
        try {
            const failing = await notReady.handle(new Request("http://localhost/health/ready"));
            expect(failing.status).toBe(503);
            expect(await failing.json()).toEqual({
                success: false,
                status: 503,
                error: {
                    message: "Service not ready",
                    issues: [{ path: "cache", message: "failed" }],
                },
            });
            expect(errorLog).toHaveBeenCalledWith("Readiness check failed", {
                check: "cache",
                error: expect.any(Error),
            });
        } finally {
            errorLog.mockRestore();
        }
    });

    test("fails a readiness check that does not answer in time", async () => {
        const app = createTestApp({
            readinessTimeoutMs: 20,
            readiness: {
                database: async () => {},
                queue: () => new Promise(() => {}),
            },
        });

        const errorLog = spyOn(logger, "error").mockImplementation(() => logger);
        try {
            const started = performance.now();
            const response = await app.handle(new Request("http://localhost/health/ready"));

            expect(performance.now() - started).toBeLessThan(1_000);
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({
                error: { issues: [{ path: "queue", message: "timed out" }] },
            });
            expect(errorLog).toHaveBeenCalledWith("Readiness check timed out", {
                check: "queue",
                timeoutMs: 20,
            });
        } finally {
            errorLog.mockRestore();
        }
    });

    test("serves OpenAPI docs only when enabled", async () => {
        const withDocs = await createTestApp({ docs: true }).handle(
            new Request("http://localhost/openapi/json")
        );
        expect(withDocs.status).toBe(200);
        const spec = (await withDocs.json()) as { paths: Record<string, unknown> };
        expect(Object.keys(spec.paths)).toContain("/api/v1/notes/");

        const withoutDocs = await createTestApp().handle(
            new Request("http://localhost/openapi/json")
        );
        expect(withoutDocs.status).toBe(404);
    });
});
