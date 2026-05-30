import { prisma } from "@mono/database";
import { BaseRepository } from "./base.repository";

class UserRepository extends BaseRepository<typeof prisma.user> {
    constructor() {
        super(prisma.user, "user", {
            softDelete: true,
        });
    }
}

export const userRepository = new UserRepository();
