import { prisma } from "@mono/database";
import { BaseRepository } from "./base.repository";

class NotificationRecipientRepository extends BaseRepository<typeof prisma.notificationRecipient> {
    constructor() {
        super(prisma.notificationRecipient, "notificationRecipient", {
            softDelete: true,
        });
    }
}

export const notificationRecipientRepository = new NotificationRecipientRepository();
