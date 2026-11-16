import type { PrismaClient } from "@mono/database";
import { prisma } from "@mono/database";

import { BaseRepository } from "./base.repository";

export class NoteRepository extends BaseRepository<PrismaClient["note"]> {
    constructor(client: PrismaClient) {
        // Notes have a nullable deletedAt: reads skip deleted rows and deletes set deletedAt.
        super(client.note, "note", { softDelete: true });
    }
}

export const noteRepository = new NoteRepository(prisma);
