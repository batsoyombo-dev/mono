import * as http from "http";
import * as util from "util";

import { logger } from "@mono/logger";

import { AppError, InternalServerError } from "./exceptions";

let httpServerRef: http.Server;

const errorHandler = {
    // Listen to the global process-level error events
    listenToErrorEvents: (httpServer?: http.Server) => {
        if (httpServer) httpServerRef = httpServer;
        process.on("uncaughtException", (error) => {
            errorHandler.handleError(error);
        });

        process.on("unhandledRejection", (reason) => {
            errorHandler.handleError(reason);
        });

        process.on("SIGTERM", () => {
            logger.error("App received SIGTERM event, try to gracefully close the server");
            terminateHttpServerAndExit();
        });

        process.on("SIGINT", () => {
            logger.error("App received SIGINT event, try to gracefully close the server");
            terminateHttpServerAndExit();
        });
    },

    handleError: (errorToHandle: unknown) => {
        try {
            const appError: AppError = normalizeError(errorToHandle);
            logger.error(JSON.stringify(appError));
            metricsExporter.fireMetric("error", { errorName: appError.name }); // fire any custom metric when handling error
            // A common best practice is to crash when an unknown error (non-trusted) is being thrown
            if (!appError.isTrusted) {
                terminateHttpServerAndExit();
            }
        } catch (handlingError: unknown) {
            // Not using the logger here because it might have failed
            process.stdout.write(
                "The error handler failed, here are the handler failure and then the origin error that it tried to handle"
            );
            process.stdout.write(JSON.stringify(handlingError));
            process.stdout.write(JSON.stringify(errorToHandle));
        }
    },
};

const terminateHttpServerAndExit = async () => {
    // maybe implement more complex logic here (like using 'http-terminator' library)
    if (httpServerRef) {
        httpServerRef.close();
    }
    process.exit();
};

// The input might won't be 'AppError' or even 'Error' instance, the output of this function will be - AppError.
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
