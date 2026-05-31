import { errorHandler } from "@mono/error-handling";
import { logger } from "@mono/logger";

import { jobs } from "./initialize";
import { Scheduler } from "./Scheduler";

export async function startSchedulerService() {
    const scheduler = new Scheduler({
        timezone: "Asia/Ulaanbaatar",
        logLevel: "info",
        maxHistorySize: 500,
    });

    scheduler.on("jobCompleted", (job, execution, result) => {
        logger.info(`✅ Job ${job.name} completed:`, result);
    });

    scheduler.on("jobFailed", (job, execution, error) => {
        logger.error(`❌ Job ${job.name} failed:`, error.message);
    });

    scheduler.addJobs(jobs);
    scheduler.start();

    process.on("uncaughtException", (error) => {
        errorHandler.handleError(error);
    });

    process.on("unhandledRejection", (reason) => {
        errorHandler.handleError(reason);
    });

    process.on("SIGTERM", () => {
        logger.error("App received SIGTERM event, try to gracefully close the server");
        scheduler.stop();
    });

    process.on("SIGINT", () => {
        logger.error("App received SIGINT event, try to gracefully close the server");
        scheduler.stop();
    });
}
