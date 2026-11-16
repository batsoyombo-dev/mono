import { z } from "zod";

import { listSchema } from "@mono/utils";

export const noteIdSchema = z.coerce.number().int().positive();

export const noteParamsSchema = z.object({ noteId: noteIdSchema });

export const createNoteSchema = z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().max(20_000).default(""),
    pinned: z.boolean().default(false),
});

export const updateNoteSchema = z
    .object({
        title: z.string().trim().min(1).max(200).optional(),
        body: z.string().max(20_000).optional(),
        pinned: z.boolean().optional(),
    })
    .refine((input) => Object.values(input).some((value) => value !== undefined), {
        message: "At least one field is required",
    });

/** Pagination, filters, sorts and a free-text search, as sent by a data table. */
export const listNotesSchema = listSchema;
