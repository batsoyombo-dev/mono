import type * as http from "http";
import * as util from "util";

import { logger } from "@mono/logger";

import { AppError, InternalServerError } from "./exceptions";

type ShutdownHandler = () => void | Promise<void>;

let httpServerRef: http.Server | undefined;
let isListening = false;
let isTerminating = false;
const shutdownHandlers = new Set<ShutdownHandler>();

const errorHandler = {
    listenToErrorEvents: (httpServer?: http.Server) => {
        if (httpServer) httpServerRef = httpServer;
        if (isListening) return;
        isListening = true;

        process.on("uncaughtException", (error) => {
            void errorHandler.handleError(error);
        });

        process.on("unhandledRejection", (reason) => {
            void errorHandler.handleError(reason);
        });

        process.on("SIGTERM", () => {
            logger.info("App received SIGTERM event, shutting down");
            void terminateAndExit(0);
        });

        process.on("SIGINT", () => {
            logger.info("App received SIGINT event, shutting down");
            void terminateAndExit(0);
        });
    },

    registerShutdownHandler: (handler: ShutdownHandler) => {
        shutdownHandlers.add(handler);
        return () => shutdownHandlers.delete(handler);
    },

    handleError: async (errorToHandle: unknown) => {
        try {
            const appError: AppError = normalizeError(errorToHandle);
            logger.error(JSON.stringify(appError));
            void metricsExporter.fireMetric("error", { errorName: appError.name });
            if (!appError.isTrusted) {
                await terminateAndExit(1);
            }
        } catch (handlingError: unknown) {
            // Not using the logger here because it might have failed
            process.stderr.write(
                "The error handler failed, here are the handler failure and then the origin error that it tried to handle"
            );
            process.stderr.write(JSON.stringify(handlingError));
            process.stderr.write(JSON.stringify(errorToHandle));
        }
    },
};

const terminateAndExit = async (exitCode: number) => {
    if (isTerminating) return;
    isTerminating = true;

    await Promise.allSettled(Array.from(shutdownHandlers, (handler) => handler()));

    if (httpServerRef) {
        await new Promise<void>((resolve) => {
            httpServerRef?.close(() => resolve());
        });
    }

    process.exitCode = exitCode;
};

const normalizeError = (errorToHandle: unknown): AppError => {
    if (errorToHandle instanceof AppError) {
        return errorToHandle;
    }
    if (errorToHandle instanceof Error) {
        const appError = new InternalServerError(errorToHandle.message);
        appError.stack = errorToHandle.stack;
        return appError;
    }
    // meaning it could be any type,
    const inputType = typeof errorToHandle;
    return new InternalServerError(
        `Error Handler received a none error instance with type - ${inputType}, value - ${util.inspect(
            errorToHandle
        )}`
    );
};

// This simulates a typical monitoring solution that allow firing custom metrics when
// like Prometheus, DataDog, CloudWatch, etc
const metricsExporter = {
    fireMetric: async (name: string, labels: object) => {
        // TODO: use logger instead of conso.log
        logger.info("In real production code I will really fire metrics", {
            name,
            labels,
        });
    },
};

export { errorHandler, metricsExporter };
