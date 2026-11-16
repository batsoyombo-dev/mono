import { describe, expect, test } from "bun:test";

import { ForbiddenError } from "@mono/error-handling";
import type { NoteOperations, NoteResponse } from "@mono/services/notes/types";

import type { AuthSession } from "../src/controllers";
import { createTestApp } from "./helpers";

const session: AuthSession = { user: { id: 42, email: "ada@example.com", emailVerified: true } };
const note: NoteResponse = {
    id: 1,
    userId: 42,
    title: "Groceries",
    body: "",
    pinned: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

type Call = { operation: string; input: unknown };

function fakeNotes(calls: Call[] = []): NoteOperations {
    const record =
        <T>(operation: string, result: T) =>
        async (input: unknown) => {
            calls.push({ operation, input });
            return result;
        };

    return {
        createNote: record("createNote", note),
        listNotes: record("listNotes", {
            collection: [note],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
        getNote: record("getNote", note),
        updateNote: record("updateNote", note),
        deleteNote: record("deleteNote", { id: 1 }),
    };
}

function app(calls: Call[] = [], options: { session?: AuthSession | null } = {}) {
    return createTestApp({
        auth: {
            handler: async () => new Response("auth"),
            getSession: async () => (options.session === undefined ? session : options.session),
        },
        notes: fakeNotes(calls),
    });
}

const json = (method: string, path: string, body?: unknown) =>
    new Request(`http://localhost/api/v1/notes${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

describe("notes API", () => {
    test("requires a session before validating input", async () => {
        const response = await app([], { session: null }).handle(json("POST", "/", {}));

        expect(response.status).toBe(401);
    });

    test("creates a note for the actor and returns 201", async () => {
        const calls: Call[] = [];
        const response = await app(calls).handle(json("POST", "/", { title: "Groceries" }));

        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ data: { note: { id: 1 } } });
        expect(calls).toEqual([
            {
                operation: "createNote",
                input: { title: "Groceries", body: "", pinned: false, actorUserId: 42 },
            },
        ]);
    });

    test("validates the body and the note id", async () => {
        const calls: Call[] = [];

        expect((await app(calls).handle(json("POST", "/", { title: "" }))).status).toBe(422);
        expect((await app(calls).handle(json("GET", "/abc"))).status).toBe(422);
        expect(calls).toEqual([]);
    });

    test("passes search input and parsed ids to the service", async () => {
        const calls: Call[] = [];
        const search = {
            pagination: { page: 1, pageSize: 10 },
            filters: [{ id: "pinned", type: "boolean", operator: "equals", value: true }],
        };

        expect((await app(calls).handle(json("POST", "/search", search))).status).toBe(200);
        expect((await app(calls).handle(json("PATCH", "/1", { pinned: true }))).status).toBe(200);
        expect((await app(calls).handle(json("DELETE", "/1"))).status).toBe(200);

        expect(calls).toEqual([
            { operation: "listNotes", input: { ...search, actorUserId: 42 } },
            { operation: "updateNote", input: { pinned: true, noteId: 1, actorUserId: 42 } },
            { operation: "deleteNote", input: { noteId: 1, actorUserId: 42 } },
        ]);
    });

    test("returns the service's ownership error as 403", async () => {
        const response = await createTestApp({
            auth: { handler: async () => new Response(""), getSession: async () => session },
            notes: {
                ...fakeNotes(),
                getNote: async () => {
                    throw new ForbiddenError("You cannot access this note");
                },
            },
        }).handle(json("GET", "/2"));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            success: false,
            status: 403,
            error: { message: "You cannot access this note" },
        });
    });
});
