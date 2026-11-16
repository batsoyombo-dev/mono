import { inspect } from "node:util";

import { logger as defaultLogger } from "@mono/logger";

import { toAppError } from "./normalize";

type ShutdownHandler = () => void | Promise<void>;

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export type ListenToErrorEventsOptions = {
    /** How long shutdown handlers may run before the process is force-exited. Default 10000. */
    shutdownTimeoutMs?: number;
};

type ProcessLike = {
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    exit(code: number): void;
};

type LoggerLike = {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
};

export type ErrorHandlerDeps = {
    /** Defaults to the real `process`. Tests pass a fake to observe `exit` and emit events. */
    process?: ProcessLike;
    logger?: LoggerLike;
    stderr?: { write(text: string): unknown };
};

export type ErrorHandler = ReturnType<typeof createErrorHandler>;

/**
 * Builds a process-level error handler. Apps use the `errorHandler` instance; tests call this
 * factory with a fake `process` so `exit` and the event listeners can be observed.
 *
 * Termination policy:
 * - `uncaughtException`: always logs, runs the shutdown handlers and exits 1. After a synchronous
 *   throw escaped the stack the process state is unknown, even for a trusted `AppError`.
 * - `unhandledRejection`: logs; exits 1 only when the error is untrusted (not an `AppError`
 *   with `isTrusted`, i.e. anything `toAppError` maps to a 500).
 * - `SIGTERM`/`SIGINT`: runs the shutdown handlers and exits 0. A second signal while shutting
 *   down exits 1 at once (press Ctrl+C twice to force-quit).
 * A crash reported while shutdown is already running raises the exit code to 1.
 * A shutdown handler that rejects turns the exit code into 1. Handlers that run longer than
 * `shutdownTimeoutMs` are abandoned and the process exits 1.
 */
export function createErrorHandler(deps: ErrorHandlerDeps = {}) {
    const proc: ProcessLike = deps.process ?? (process as unknown as ProcessLike);
    const logger: LoggerLike = deps.logger ?? defaultLogger;
    const stderr = deps.stderr ?? process.stderr;

    let isListening = false;
    let isTerminating = false;
    // The code shutdown will exit with; a crash during a SIGTERM shutdown raises it to 1.
    let pendingCode = 0;
    let shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS;
    const shutdownHandlers = new Set<ShutdownHandler>();

    // Shutdown must reach `exit` even when the logger itself is what failed.
    const safeLogError = (message: string, meta: Record<string, unknown>) => {
        try {
            logger.error(message, meta);
        } catch {
            stderr.write(`${message}: ${inspect(meta)}\n`);
        }
    };

    const terminateAndExit = async (exitCode: number) => {
        pendingCode = Math.max(pendingCode, exitCode);
        if (isTerminating) return;
        isTerminating = true;

        // Never hang forever on a stuck handler; the orchestrator would SIGKILL us anyway.
        // Deliberately not unref()'d: it keeps the event loop alive, so the process cannot drain
        // and exit 0 on its own while a handler awaits a promise that holds no handle.
        const timeout = setTimeout(() => {
            safeLogError("Graceful shutdown timed out, forcing exit", { shutdownTimeoutMs });
            proc.exit(1);
        }, shutdownTimeoutMs);

        const results = await Promise.allSettled(
            Array.from(shutdownHandlers, async (handler) => handler())
        );
        let finalCode = pendingCode;
        for (const result of results) {
            if (result.status === "rejected") {
                safeLogError("Shutdown handler failed", { error: result.reason });
                finalCode = 1;
            }
        }

        clearTimeout(timeout);
        proc.exit(finalCode);
    };

    const handler = {
        /**
         * Installs process-level handlers once (see `createErrorHandler` for the policy).
         * Calling it again is a no-op, including its options.
         */
        listenToErrorEvents: (options: ListenToErrorEventsOptions = {}) => {
            if (isListening) return;

            const timeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
            if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
                throw new RangeError("shutdownTimeoutMs must be a positive number");
            }
            shutdownTimeoutMs = timeoutMs;
            isListening = true;

            proc.on("uncaughtException", (error) => {
                void handler.handleError(error, { terminate: true });
            });

            proc.on("unhandledRejection", (reason) => {
                void handler.handleError(reason);
            });

            for (const signal of ["SIGTERM", "SIGINT"] as const) {
                proc.on(signal, () => {
                    if (isTerminating) {
                        safeLogError(`Received ${signal} again, exiting without waiting`, {});
                        proc.exit(1);
                        return;
                    }
                    logger.info(`Received ${signal}, shutting down`);
                    void terminateAndExit(0);
                });
            }
        },

        registerShutdownHandler: (shutdownHandler: ShutdownHandler) => {
            shutdownHandlers.add(shutdownHandler);
            return () => shutdownHandlers.delete(shutdownHandler);
        },

        /**
         * Logs the error. Runs the shutdown handlers and exits 1 when the error is untrusted,
         * or always when `terminate` is set.
         */
        handleError: async (errorToHandle: unknown, options: { terminate?: boolean } = {}) => {
            let shouldTerminate = options.terminate ?? false;
            try {
                const appError = toAppError(errorToHandle);
                logger.error(appError.message, { error: appError });
                shouldTerminate ||= !appError.isTrusted;
            } catch (handlingError: unknown) {
                // Not using the logger here because it might be what failed.
                stderr.write(
                    `The error handler failed: ${inspect(handlingError)}\nOriginal error: ${inspect(errorToHandle)}\n`
                );
                shouldTerminate = true;
            }
            if (shouldTerminate) {
                await terminateAndExit(1);
            }
        },
    };

    return handler;
}

export const errorHandler = createErrorHandler();
