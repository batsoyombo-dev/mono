import { describe, expect, test } from "bun:test";

import type { QueueOperations } from "@mono/services/queue/types";

import { createApp } from "../src/app";
import type { AuthSession } from "../src/controllers";

const ADMIN = "admin@example.com";

const session = (email: string, emailVerified = true): AuthSession => ({
    user: { id: 7, email, emailVerified },
});

type Call = { operation: string; input: unknown };

/** Every operation records its input and returns a small canned value. */
function fakeQueues(calls: Call[] = []): QueueOperations {
    const record =
        <T>(operation: string, result: T) =>
        async (input: unknown) => {
            calls.push({ operation, input });
            return result;
        };

    return {
        overview: record("overview", []),
        listJobs: record("listJobs", {
            collection: [],
            meta: { total: 0, totalPages: 0, page: 1, pageSize: 20 },
        }),
        getJob: record("getJob", {} as never),
        enqueueJob: record("enqueueJob", { queue: "default", id: "1", name: "health" }),
        triggerSchedule: record("triggerSchedule", { queue: "default", id: "m-1", name: "health" }),
        retryJob: record("retryJob", { id: "1" }),
        promoteJob: record("promoteJob", { id: "1" }),
        removeJob: record("removeJob", { id: "1" }),
        retryFailed: record("retryFailed", { retried: 0 }),
        pause: record("pause", { paused: true as const }),
        resume: record("resume", { paused: false as const }),
        clean: record("clean", { removed: 0 }),
    };
}

function createTestApp(currentSession: AuthSession | null, calls: Call[] = []) {
    return createApp({
        allowedOrigins: [],
        auth: { handler: async () => new Response("auth"), getSession: async () => currentSession },
        queues: fakeQueues(calls),
        adminEmails: [ADMIN],
    });
}

const request = (path: string, init?: RequestInit) =>
    new Request(`http://localhost/api/v1/admin/queues${path}`, init);

const postJson = (path: string, body: unknown) =>
    request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

describe("admin queue API", () => {
    test("rejects requests without a session", async () => {
        const response = await createTestApp(null).handle(request("/"));
        expect(response.status).toBe(401);
    });

    test("rejects signed-in users who are not admins", async () => {
        const response = await createTestApp(session("someone@example.com")).handle(request("/"));
        expect(response.status).toBe(403);
    });

    test("rejects an admin email that is not verified", async () => {
        const response = await createTestApp(session(ADMIN, false)).handle(request("/"));
        expect(response.status).toBe(403);
    });

    test("checks auth before validating input", async () => {
        const response = await createTestApp(null).handle(request("/nope/jobs?status=bogus"));
        expect(response.status).toBe(401);
    });

    test("matches admin emails case-insensitively", async () => {
        const calls: Call[] = [];
        const response = await createTestApp(session("Admin@Example.com"), calls).handle(
            request("/")
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, status: 200, data: { queues: [] } });
        expect(calls).toEqual([{ operation: "overview", input: { actorUserId: 7 } }]);
    });

    test("lists jobs with parsed query defaults", async () => {
        const calls: Call[] = [];
        const response = await createTestApp(session(ADMIN), calls).handle(
            request("/default/jobs?status=failed&page=2")
        );

        expect(response.status).toBe(200);
        expect(calls).toEqual([
            {
                operation: "listJobs",
                input: {
                    status: "failed",
                    page: 2,
                    pageSize: 20,
                    queue: "default",
                    actorUserId: 7,
                },
            },
        ]);
    });

    test("rejects an unknown job status or queue", async () => {
        const app = createTestApp(session(ADMIN));

        expect((await app.handle(request("/default/jobs?status=bogus"))).status).toBe(422);
        expect((await app.handle(request("/nope/jobs"))).status).toBe(422);
    });

    test("triggers a schedule now", async () => {
        const calls: Call[] = [];
        const response = await createTestApp(session(ADMIN), calls).handle(
            postJson("/default/schedules/health-check/trigger", {})
        );

        expect(response.status).toBe(200);
        expect(calls).toEqual([
            {
                operation: "triggerSchedule",
                input: { queue: "default", scheduleId: "health-check", actorUserId: 7 },
            },
        ]);
    });

    test("enqueues a job manually", async () => {
        const calls: Call[] = [];
        const response = await createTestApp(session(ADMIN), calls).handle(
            postJson("/default/jobs", { name: "health", data: { pong: "manual" }, delayMs: 500 })
        );

        expect(response.status).toBe(200);
        expect(calls).toEqual([
            {
                operation: "enqueueJob",
                input: {
                    name: "health",
                    data: { pong: "manual" },
                    delayMs: 500,
                    queue: "default",
                    actorUserId: 7,
                },
            },
        ]);
    });

    test("rejects a job id containing ':'", async () => {
        const response = await createTestApp(session(ADMIN)).handle(
            postJson("/default/jobs", { name: "health", jobId: "a:b" })
        );
        expect(response.status).toBe(422);
    });
});
