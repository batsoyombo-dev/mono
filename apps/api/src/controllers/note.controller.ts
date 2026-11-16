import { Elysia } from "elysia";

import {
    createNoteSchema,
    listNotesSchema,
    noteParamsSchema,
    updateNoteSchema,
} from "@mono/services/notes/schema";
import type { NoteOperations } from "@mono/services/notes/types";

import type { AuthHandler } from "./auth-handler";
import { getAuthorizedSessionUserId } from "./session-guard";
import { success } from "../utils/response";

type NoteControllerOptions = {
    auth: Pick<AuthHandler, "getSession">;
    notes: NoteOperations;
};

/**
 * Reference CRUD controller: parse the request, resolve the actor, call the service, wrap the
 * result. No business rules or ownership checks here; those live in the service.
 */
export function createNoteController({ auth, notes }: NoteControllerOptions) {
    return (
        new Elysia({ prefix: "/notes", name: "Notes", detail: { tags: ["notes"] } })
            // derive runs after the body is parsed but before it is validated: an unauthenticated
            // call gets 401 rather than 422 (a malformed JSON body is still a 400 first).
            .derive(async ({ request }) => ({
                actorUserId: await getAuthorizedSessionUserId(auth, request),
            }))
            .post(
                "/",
                async ({ actorUserId, body }) =>
                    success({ note: await notes.createNote({ ...body, actorUserId }) }, 201),
                { body: createNoteSchema }
            )
            // POST because a data table sends pagination, filters and sorts as a JSON body.
            .post(
                "/search",
                async ({ actorUserId, body }) =>
                    success(await notes.listNotes({ ...body, actorUserId })),
                { body: listNotesSchema }
            )
            .get(
                "/:noteId",
                async ({ actorUserId, params }) =>
                    success({ note: await notes.getNote({ ...params, actorUserId }) }),
                { params: noteParamsSchema }
            )
            .patch(
                "/:noteId",
                async ({ actorUserId, params, body }) =>
                    success({
                        note: await notes.updateNote({ ...body, ...params, actorUserId }),
                    }),
                { params: noteParamsSchema, body: updateNoteSchema }
            )
            .delete(
                "/:noteId",
                async ({ actorUserId, params }) =>
                    success(await notes.deleteNote({ ...params, actorUserId })),
                { params: noteParamsSchema }
            )
    );
}
