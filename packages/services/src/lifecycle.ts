import { cache } from "@mono/cache";
import { prisma } from "@mono/database";

import { queues } from "./queues/registry";

/**
 * Closes every connection the services hold: BullMQ queues, the cache's Redis and Prisma.
 * Apps call it from their shutdown handler, after they stop taking new work.
 */
export async function closeServices(): Promise<void> {
    const results = await Promise.allSettled([
        ...Object.values(queues).map((queue) => queue.close()),
        cache.disconnect(),
        prisma.$disconnect(),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
}
