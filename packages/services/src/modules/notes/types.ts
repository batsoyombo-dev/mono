import type { z } from "zod";

import type { PaginationResponse } from "@mono/utils";

import type { createNoteSchema, listNotesSchema, updateNoteSchema } from "./schema";

export type CreateNotePayload = z.input<typeof createNoteSchema>;
export type UpdateNotePayload = z.input<typeof updateNoteSchema>;
export type ListNotesPayload = z.input<typeof listNotesSchema>;

type Actor = { actorUserId: number };
type NoteTarget = Actor & { noteId: number };

export type CreateNoteInput = Actor & CreateNotePayload;
export type ListNotesInput = Actor & ListNotesPayload;
export type GetNoteInput = NoteTarget;
export type UpdateNoteInput = NoteTarget & UpdateNotePayload;
export type DeleteNoteInput = NoteTarget;

export type NoteResponse = {
    id: number;
    userId: number;
    title: string;
    body: string;
    pinned: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type NoteListResponse = {
    collection: NoteResponse[];
    meta: PaginationResponse;
};

export type NoteOperations = {
    createNote(input: CreateNoteInput): Promise<NoteResponse>;
    listNotes(input: ListNotesInput): Promise<NoteListResponse>;
    getNote(input: GetNoteInput): Promise<NoteResponse>;
    updateNote(input: UpdateNoteInput): Promise<NoteResponse>;
    deleteNote(input: DeleteNoteInput): Promise<{ id: number }>;
};
