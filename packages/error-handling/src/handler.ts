import { inspect } from "node:util";

import { logger } from "@mono/logger";

import { toAppError } from "./normalize";

type ShutdownHandler = () => void | Promise<void>;

const SHUTDOWN_TIMEOUT_MS = 10_000;

let isListening = false;
let isTerminating = false;
const shutdownHandlers = new Set<ShutdownHandler>();

const terminateAndExit = async (exitCode: number) => {
    if (isTerminating) return;
    isTerminating = true;

    // Never hang forever on a stuck handler; the orchestrator would SIGKILL us anyway.
    const timeout = setTimeout(() => {
        logger.error("Graceful shutdown timed out, forcing exit");
        process.exit(exitCode || 1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    const results = await Promise.allSettled(
        Array.from(shutdownHandlers, async (handler) => handler())
    );
    for (const result of results) {
        if (result.status === "rejected") {
            logger.error("Shutdown handler failed", { error: result.reason });
        }
    }

    process.exit(exitCode);
};

const errorHandler = {
    /**
     * Installs process-level handlers once: crashes are logged, untrusted errors and
     * SIGTERM/SIGINT run the registered shutdown handlers before exiting.
     */
    listenToErrorEvents: () => {
        if (isListening) return;
        isListening = true;

        process.on("uncaughtException", (error) => {
            void errorHandler.handleError(error);
        });

        process.on("unhandledRejection", (reason) => {
            void errorHandler.handleError(reason);
        });

        for (const signal of ["SIGTERM", "SIGINT"] as const) {
            process.on(signal, () => {
                logger.info(`Received ${signal}, shutting down`);
                void terminateAndExit(0);
            });
        }
    },

    registerShutdownHandler: (handler: ShutdownHandler) => {
        shutdownHandlers.add(handler);
        return () => shutdownHandlers.delete(handler);
    },

    handleError: async (errorToHandle: unknown) => {
        try {
            const appError = toAppError(errorToHandle);
            logger.error(appError.message, { error: appError });
            if (!appError.isTrusted) {
                await terminateAndExit(1);
            }
        } catch (handlingError: unknown) {
            // Not using the logger here because it might be what failed.
            process.stderr.write(
                `The error handler failed: ${inspect(handlingError)}\nOriginal error: ${inspect(errorToHandle)}\n`
            );
        }
    },
};

export { errorHandler };
