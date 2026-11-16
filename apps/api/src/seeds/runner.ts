import { logger } from "@mono/logger";

import type { Seeder } from "./types";

/** Runs seeders in order; each seeder must be idempotent so `bun run seed` can be repeated. */
export async function runSeeders(seeders: readonly Seeder[]): Promise<void> {
    for (const seeder of seeders) {
        await seeder.run();
        logger.info(`Seeded ${seeder.name}`);
    }
}
