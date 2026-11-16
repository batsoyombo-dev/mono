import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { createBullBoard } from "@bull-board/api";
import { ElysiaAdapter } from "@bull-board/elysia";
import type { AnyElysia } from "elysia";
import { Elysia } from "elysia";

import type { AuthSession } from "../src/controllers";
import { adminOnly } from "../src/plugins/admin-only.plugin";
import { createTestApp } from "./helpers";

const ADMIN = "admin@example.com";
const PREFIX = "/admin/queues";

const session = (email: string): AuthSession => ({ user: { id: 7, email, emailVerified: true } });

/** A stand-in for a mounted third-party app: a page, an asset and a JSON API under one prefix. */
const dummyBoard = () =>
    new Elysia({ prefix: PREFIX })
        .get("/", () => "board")
        .get("/static/app.js", () => "asset")
        .post("/api/queues/:queue/pause", ({ params }) => ({ paused: params.queue }));

/** The real Bull Board plugin, with no queues, so it needs no Redis. */
async function realBoard() {
    const serverAdapter = new ElysiaAdapter({ prefix: PREFIX, basePath: PREFIX });
    createBullBoard({
        queues: [],
        serverAdapter,
        options: {
            uiBasePath: dirname(fileURLToPath(import.meta.resolve("@bull-board/ui/package.json"))),
        },
    });
    return serverAdapter.registerPlugin();
}

function appWith(plugin: AnyElysia, currentSession: AuthSession | null) {
    return createTestApp({
        auth: { handler: async () => new Response("auth"), getSession: async () => currentSession },
        adminEmails: [ADMIN],
        plugins: [
            adminOnly(
                { auth: { getSession: async () => currentSession }, adminEmails: [ADMIN] },
                plugin
            ),
        ],
    });
}

// Elysia routes on `url.indexOf("/", 11)`, so with a short host this URL parses to the pathname
// `/zz/admin/queues/...` but is routed to `/admin/queues/...`. A guard that tests the parsed
// pathname lets it through; a hook on the matched route does not.
const shortHost = (path: string) => `http://x/zz${PREFIX}${path}`;

describe("adminOnly", () => {
    const paths = ["/", "/static/app.js"];

    test("rejects requests without a session", async () => {
        const app = appWith(dummyBoard(), null);
        for (const path of paths) {
            const response = await app.handle(new Request(`http://localhost${PREFIX}${path}`));
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({
                success: false,
                status: 401,
                error: { message: "Unauthorized" },
            });
        }
    });

    test("rejects signed-in users who are not admins", async () => {
        const app = appWith(dummyBoard(), session("someone@example.com"));
        for (const path of paths) {
            const response = await app.handle(new Request(`http://localhost${PREFIX}${path}`));
            expect(response.status).toBe(403);
        }
    });

    test("serves admins", async () => {
        const app = appWith(dummyBoard(), session(ADMIN));

        const page = await app.handle(new Request(`http://localhost${PREFIX}/`));
        expect(page.status).toBe(200);
        expect(await page.text()).toBe("board");

        const action = await app.handle(
            new Request(`http://localhost${PREFIX}/api/queues/default/pause`, { method: "POST" })
        );
        expect(action.status).toBe(200);
        expect(await action.json()).toEqual({ paused: "default" });
    });

    test("checks the session before running the handler or reading params", async () => {
        const app = appWith(dummyBoard(), null);
        const response = await app.handle(
            new Request(`http://localhost${PREFIX}/api/queues/default/pause`, { method: "POST" })
        );
        expect(response.status).toBe(401);
    });

    test("rejects a URL whose parsed pathname differs from the routed path", async () => {
        const anonymous = appWith(dummyBoard(), null);
        for (const path of [...paths, "/api/queues/default/pause"]) {
            const method = path.startsWith("/api") ? "POST" : "GET";
            const response = await anonymous.handle(new Request(shortHost(path), { method }));
            expect(response.status).toBe(401);
        }

        // Sanity check that the URL really reaches the wrapped routes.
        const admin = appWith(dummyBoard(), session(ADMIN));
        expect(await (await admin.handle(new Request(shortHost("/")))).text()).toBe("board");
    });

    test("guards every route of the real Bull Board plugin", async () => {
        const anonymous = appWith(await realBoard(), null);
        const nonAdmin = appWith(await realBoard(), session("someone@example.com"));
        const admin = appWith(await realBoard(), session(ADMIN));
        const urls = [
            `http://localhost${PREFIX}`,
            `http://localhost${PREFIX}/api/queues`,
            shortHost("/api/queues"),
            shortHost(""),
        ];

        for (const url of urls) {
            const unauthorized = await anonymous.handle(new Request(url));
            expect(unauthorized.status).toBe(401);
            // Our error envelope, not Bull Board's own error handler.
            expect(await unauthorized.json()).toEqual({
                success: false,
                status: 401,
                error: { message: "Unauthorized" },
            });
            expect((await nonAdmin.handle(new Request(url))).status).toBe(403);
        }

        const queues = await admin.handle(new Request(`http://localhost${PREFIX}/api/queues`));
        expect(queues.status).toBe(200);
        expect(await queues.json()).toMatchObject({ queues: [] });

        const page = await admin.handle(new Request(`http://localhost${PREFIX}`));
        expect(page.status).toBe(200);
        expect(page.headers.get("content-type")).toContain("text/html");
    });

    test("guards the real Bull Board static assets", async () => {
        const html = await (
            await appWith(await realBoard(), session(ADMIN)).handle(
                new Request(`http://localhost${PREFIX}`)
            )
        ).text();
        const asset = /src="([^"]+\.js)"/.exec(html)?.[1];
        expect(asset).toBeString();
        const assetPath = new URL(asset!, `http://localhost${PREFIX}/`).pathname;

        const anonymous = appWith(await realBoard(), null);
        expect((await anonymous.handle(new Request(`http://localhost${assetPath}`))).status).toBe(
            401
        );
        expect((await anonymous.handle(new Request(`http://x/zz${assetPath}`))).status).toBe(401);

        const admin = appWith(await realBoard(), session(ADMIN));
        expect((await admin.handle(new Request(`http://localhost${assetPath}`))).status).toBe(200);
    });
});
