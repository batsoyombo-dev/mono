import { ForbiddenError, NotFoundError } from "@mono/error-handling";

import type { NoteRepository } from "../../repositories/note.repository";
import type { ListFieldOptions } from "../../utils/filters";
import { parseListRouteInput } from "../../utils/filters";
import { createNoteSchema, listNotesSchema, noteIdSchema, updateNoteSchema } from "./schema";
import type {
    CreateNoteInput,
    DeleteNoteInput,
    GetNoteInput,
    ListNotesInput,
    NoteListResponse,
    NoteOperations,
    NoteResponse,
    UpdateNoteInput,
} from "./types";

/**
 * Reference CRUD module: copy its shape for new resources.
 * - Every operation takes `actorUserId` and checks ownership here, not in the controller.
 * - Input is re-validated with the module's schemas (zod errors become 422 automatically).
 * - Lists go through `parseListRouteInput` with explicit filter and sort allowlists.
 * - The repository is soft-delete aware, so deleted notes behave as missing everywhere.
 */

const noteSelect = {
    id: true,
    userId: true,
    title: true,
    body: true,
    pinned: true,
    createdAt: true,
    updatedAt: true,
} as const;

/**
 * Fields callers may filter (with each field's type) and sort by, and the order used when the
 * request sends none. Never list columns that must stay private. `parseListRouteInput` appends
 * `id desc` to every order so pages stay stable when sort values tie.
 */
const listFields = {
    filterFields: { title: "text", pinned: "boolean", createdAt: "date", updatedAt: "date" },
    sortFields: ["title", "pinned", "createdAt", "updatedAt"],
    defaultSorts: [{ pinned: "desc" }, { createdAt: "desc" }],
} satisfies ListFieldOptions;

export type NoteServiceDeps = {
    notes: Pick<NoteRepository, "create" | "getManyWithPage" | "getOneById" | "update" | "delete">;
};

export function createNoteService({ notes }: NoteServiceDeps): NoteOperations {
    /** Loads a note the actor owns: 404 when it does not exist, 403 when someone else owns it. */
    async function getOwnedNote(actorUserId: number, noteId: number): Promise<NoteResponse> {
        const note = await notes.getOneById(noteIdSchema.parse(noteId), { select: noteSelect });
        if (!note) throw new NotFoundError("Note");
        if (note.userId !== actorUserId) throw new ForbiddenError("You cannot access this note");
        return note;
    }

    async function createNote({ actorUserId, ...payload }: CreateNoteInput): Promise<NoteResponse> {
        const data = createNoteSchema.parse(payload);

        return notes.create({ data: { ...data, userId: actorUserId }, select: noteSelect });
    }

    async function listNotes({
        actorUserId,
        ...payload
    }: ListNotesInput): Promise<NoteListResponse> {
        const { filters, globalFilter, pagination, sorts } = parseListRouteInput(
            listNotesSchema.parse(payload),
            listFields
        );

        return notes.getManyWithPage(pagination, {
            where: {
                AND: [
                    { userId: actorUserId },
                    filters,
                    globalFilter
                        ? {
                              OR: [
                                  { title: { contains: globalFilter, mode: "insensitive" } },
                                  { body: { contains: globalFilter, mode: "insensitive" } },
                              ],
                          }
                        : {},
                ],
            },
            orderBy: sorts,
            select: noteSelect,
        });
    }

    async function getNote({ actorUserId, noteId }: GetNoteInput): Promise<NoteResponse> {
        return getOwnedNote(actorUserId, noteId);
    }

    async function updateNote({
        actorUserId,
        noteId,
        ...payload
    }: UpdateNoteInput): Promise<NoteResponse> {
        const data = updateNoteSchema.parse(payload);
        const note = await getOwnedNote(actorUserId, noteId);

        return notes.update({ where: { id: note.id }, data, select: noteSelect });
    }

    async function deleteNote({ actorUserId, noteId }: DeleteNoteInput): Promise<{ id: number }> {
        const note = await getOwnedNote(actorUserId, noteId);
        await notes.delete({ where: { id: note.id } });

        return { id: note.id };
    }

    return { createNote, listNotes, getNote, updateNote, deleteNote };
}
