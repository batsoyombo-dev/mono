import type { PrismaClient } from "@mono/database";
import { prisma } from "@mono/database";

import { BaseRepository } from "./base.repository";

export class UserRepository extends BaseRepository<PrismaClient["user"]> {
    constructor(client: PrismaClient) {
        super(client.user, "user");
    }
}

export const userRepository = new UserRepository(prisma);
