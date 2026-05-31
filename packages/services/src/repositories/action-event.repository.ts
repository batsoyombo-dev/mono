import { prisma } from "@mono/database";
import { BaseRepository } from "./base.repository";

class ActionEventRepository extends BaseRepository<typeof prisma.actionEvent> {
    constructor() {
        super(prisma.actionEvent, "actionEvent", {
            softDelete: true,
        });
    }
}

export const actionEventRepository = new ActionEventRepository();
