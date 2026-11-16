// Validate the environment before any package that reads it is loaded.
import "./config";

import { prisma } from "@mono/database";
import { logger } from "@mono/logger";

import { runSeeders, seeders } from "./seeds";

try {
    await runSeeders(seeders);
    logger.info("Database seed complete");
} catch (error) {
    logger.error("Database seed failed", { error });
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
