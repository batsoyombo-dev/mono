import { prisma } from "@mono/database";
import { BaseRepository } from "./base.repository";

class NotificationRepository extends BaseRepository<typeof prisma.notification> {
    constructor() {
        super(prisma.notification, "notification", {
            softDelete: true,
        });
    }
}

export const notificationRepository = new NotificationRepository();
