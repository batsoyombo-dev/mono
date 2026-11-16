// Validate the environment before any package that reads it is loaded.
import { config } from "./config";

import { prisma } from "@mono/database";
import { logger } from "@mono/logger";

import { runSeeders, seeders } from "./seeds";

// Seeders create known demo credentials (and .env.example makes the demo user an admin).
if (config.NODE_ENV === "production" && !process.argv.includes("--allow-production")) {
    logger.error("Refusing to seed with NODE_ENV=production. Pass --allow-production to override.");
    process.exit(1);
}

try {
    await runSeeders(seeders);
    logger.info("Database seed complete");
} catch (error) {
    logger.error("Database seed failed", { error });
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
