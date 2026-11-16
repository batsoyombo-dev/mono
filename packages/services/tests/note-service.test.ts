import { describe, expect, test } from "bun:test";

import { ForbiddenError, NotFoundError, ValidationError } from "@mono/error-handling";

import type { NoteServiceDeps } from "../src/modules/notes/service";
import { createNoteService } from "../src/modules/notes/service";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const note = (id: number, userId: number, title = `Note ${id}`) => ({
    id,
    userId,
    title,
    body: "",
    pinned: false,
    createdAt,
    updatedAt: createdAt,
});

/** An in-memory stand-in for NoteRepository that records what the service asks for. */
function fakeNotes(rows = [note(1, 42), note(2, 7)]) {
    const calls: Record<string, unknown[]> = { create: [], list: [], update: [], delete: [] };
    const notes = {
        create: async (args: { data: object }) => {
            calls.create!.push(args);
            return { ...note(3, 42), ...args.data };
        },
        getManyWithPage: async (pagination: unknown, args: unknown) => {
            calls.list!.push({ pagination, args });
            return { collection: rows, meta: { page: 1, pageSize: 20, total: rows.length } };
        },
        getOneById: async (id: number) => rows.find((row) => row.id === id) ?? null,
        update: async (args: { where: { id: number }; data: object }) => {
            calls.update!.push(args);
            return { ...rows.find((row) => row.id === args.where.id)!, ...args.data };
        },
        delete: async (args: unknown) => {
            calls.delete!.push(args);
            return {};
        },
    } as unknown as NoteServiceDeps["notes"];

    return { service: createNoteService({ notes }), calls };
}

describe("noteService", () => {
    test("creates a note owned by the actor with schema defaults", async () => {
        const { service, calls } = fakeNotes();

        await service.createNote({ actorUserId: 42, title: "  Groceries  " });

        expect(calls.create).toEqual([
            {
                data: { title: "Groceries", body: "", pinned: false, userId: 42 },
                select: expect.any(Object),
            },
        ]);
    });

    test("rejects invalid input with zod's error, which the edges map to 422", async () => {
        const { service } = fakeNotes();

        // The service throws zod's error; toAppError maps it to ValidationError at the edges.
        await expect(service.createNote({ actorUserId: 42, title: "" })).rejects.toMatchObject({
            name: "ZodError",
        });
    });

    test("returns 404 for a missing note and 403 for someone else's", async () => {
        const { service } = fakeNotes();

        await expect(service.getNote({ actorUserId: 42, noteId: 99 })).rejects.toBeInstanceOf(
            NotFoundError
        );
        await expect(service.getNote({ actorUserId: 42, noteId: 2 })).rejects.toBeInstanceOf(
            ForbiddenError
        );
        await expect(
            service.updateNote({ actorUserId: 42, noteId: 2, title: "Mine now" })
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(service.deleteNote({ actorUserId: 42, noteId: 2 })).rejects.toBeInstanceOf(
            ForbiddenError
        );
    });

    test("updates and deletes the actor's own note", async () => {
        const { service, calls } = fakeNotes();

        expect(
            await service.updateNote({ actorUserId: 42, noteId: 1, pinned: true })
        ).toMatchObject({ id: 1, pinned: true });
        expect(await service.deleteNote({ actorUserId: 42, noteId: 1 })).toEqual({ id: 1 });
        expect(calls.delete).toEqual([{ where: { id: 1 } }]);
    });

    test("lists only the actor's notes, with allowlisted filters and sorts", async () => {
        const { service, calls } = fakeNotes();

        await service.listNotes({
            actorUserId: 42,
            pagination: { page: 2, pageSize: 10 },
            filters: [{ id: "pinned", type: "boolean", operator: "equals", value: true }],
            sorts: [{ id: "title", desc: false }],
            globalFilter: "milk",
        });

        expect(calls.list).toEqual([
            {
                pagination: { page: 2, pageSize: 10, skip: 10 },
                args: {
                    where: {
                        AND: [
                            { userId: 42 },
                            { pinned: { equals: true } },
                            {
                                OR: [
                                    { title: { contains: "milk", mode: "insensitive" } },
                                    { body: { contains: "milk", mode: "insensitive" } },
                                ],
                            },
                        ],
                    },
                    orderBy: [{ title: "asc" }, { id: "desc" }],
                    select: expect.any(Object),
                },
            },
        ]);
    });

    test("orders by pinned, newest first, with an id tiebreaker when no sort is sent", async () => {
        const { service, calls } = fakeNotes();

        await service.listNotes({ actorUserId: 42 });

        expect(calls.list).toEqual([
            {
                pagination: expect.any(Object),
                args: expect.objectContaining({
                    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
                }),
            },
        ]);
    });

    test("rejects a filter whose type or operator does not fit the field", async () => {
        const { service } = fakeNotes();

        await expect(
            service.listNotes({
                actorUserId: 42,
                filters: [{ id: "pinned", type: "text", operator: "contains", value: "x" }],
            })
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
            service.listNotes({
                actorUserId: 42,
                filters: [{ id: "createdAt", type: "date", operator: "blank", value: "" }],
            })
        ).rejects.toBeInstanceOf(ValidationError);
    });

    test("rejects filters on fields that are not allowlisted", async () => {
        const { service } = fakeNotes();

        await expect(
            service.listNotes({
                actorUserId: 42,
                filters: [{ id: "userId", type: "number", operator: "equals", value: 7 }],
            })
        ).rejects.toBeInstanceOf(ValidationError);
    });
});
