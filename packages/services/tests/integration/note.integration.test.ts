/**
 * The reference CRUD module against a real PostgreSQL (`bun run infra:up && bun run db:deploy`).
 * Run with `bun run test:integration`. Users created here use a unique email prefix and are
 * deleted afterwards; their notes go with them (ON DELETE CASCADE).
 */
import { afterAll, describe, expect, test } from "bun:test";

import { createDatabase } from "@mono/database";
import { defineEnv } from "@mono/env";
import { ConflictError, ForbiddenError, NotFoundError, toAppError } from "@mono/error-handling";

import { createNoteService } from "../../src/modules/notes/service";
import { NoteRepository } from "../../src/repositories/note.repository";
import { UserRepository } from "../../src/repositories/user.repository";

const config = defineEnv("integration-tests", { groups: ["database"] });
const prisma = createDatabase({ url: config.DATABASE_URL });
const users = new UserRepository(prisma);
const notes = new NoteRepository(prisma);
const service = createNoteService({ notes });

const run = `it-${crypto.randomUUID().slice(0, 8)}`;
const createUser = (name: string) =>
    users.create({ data: { name, email: `${run}-${name}@example.com` } });

afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
    await prisma.$disconnect();
});

describe("noteService with PostgreSQL", () => {
    test("runs the full lifecycle with ownership and soft delete", async () => {
        const [ada, eve] = await Promise.all([createUser("ada"), createUser("eve")]);

        const note = await service.createNote({ actorUserId: ada.id, title: "Groceries" });
        expect(note).toMatchObject({ userId: ada.id, title: "Groceries", pinned: false });
        expect(note.createdAt).toBeInstanceOf(Date);

        await expect(
            service.getNote({ actorUserId: eve.id, noteId: note.id })
        ).rejects.toBeInstanceOf(ForbiddenError);

        const pinned = await service.updateNote({
            actorUserId: ada.id,
            noteId: note.id,
            pinned: true,
        });
        expect(pinned.pinned).toBe(true);

        await service.deleteNote({ actorUserId: ada.id, noteId: note.id });

        // Soft-deleted: the row stays, but every read and write treats it as missing.
        expect(await prisma.note.count({ where: { id: note.id } })).toBe(1);
        await expect(
            service.getNote({ actorUserId: ada.id, noteId: note.id })
        ).rejects.toBeInstanceOf(NotFoundError);
        const updateDeleted = notes.update({ where: { id: note.id }, data: { title: "x" } });
        expect(toAppError(await updateDeleted.catch((error: unknown) => error))).toBeInstanceOf(
            NotFoundError
        );
    });

    test("lists only the actor's notes with filters, search and paging", async () => {
        const [owner, other] = await Promise.all([createUser("lister"), createUser("other")]);
        for (const [title, pinned] of [
            ["Milk and eggs", true],
            ["Call mom", false],
            ["Buy milk", false],
        ] as const) {
            await service.createNote({ actorUserId: owner.id, title, pinned });
        }
        await service.createNote({ actorUserId: other.id, title: "Milk (not yours)" });

        const search = await service.listNotes({
            actorUserId: owner.id,
            globalFilter: "milk",
            sorts: [{ id: "title", desc: false }],
        });
        expect(search.collection.map((note) => note.title)).toEqual(["Buy milk", "Milk and eggs"]);
        expect(search.meta).toMatchObject({ total: 2 });

        const pinnedOnly = await service.listNotes({
            actorUserId: owner.id,
            filters: [{ id: "pinned", type: "boolean", operator: "equals", value: true }],
        });
        expect(pinnedOnly.collection.map((note) => note.title)).toEqual(["Milk and eggs"]);

        const page = await service.listNotes({
            actorUserId: owner.id,
            pagination: { page: 2, pageSize: 2 },
        });
        expect(page.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });
});

describe("Prisma errors through toAppError", () => {
    test("a unique violation becomes a ConflictError naming the field", async () => {
        const user = await createUser("dupe");
        const error = await users
            .create({ data: { name: "again", email: user.email } })
            .catch((caught: unknown) => caught);

        const appError = toAppError(error);
        expect(appError).toBeInstanceOf(ConflictError);
        expect(appError.message).toBe("A record with this email already exists");
    });
});
