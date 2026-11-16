import { Elysia } from "elysia";

import { AppError, ValidationError } from "@mono/error-handling";
import { logger } from "@mono/logger";

import { failure } from "../utils/response";

type ElysiaError = Error & {
    code?: string;
    all?: unknown;
    errors?: unknown;
};

export const errorResponsePlugin = new Elysia({ name: "ErrorResponse" })
    .onError(({ code, error }) => {
        if (error instanceof ValidationError) {
            return failure(error.statusCode, error.message, error.errors);
        }

        if (error instanceof AppError) {
            return failure(error.statusCode, error.message);
        }

        const elysiaError = error as ElysiaError;
        if (code === "VALIDATION" || elysiaError.code === "VALIDATION") {
            return failure(422, "Validation failed", elysiaError.all ?? elysiaError.errors);
        }

        if (code === "PARSE") {
            return failure(400, "Malformed request body");
        }

        if (code === "INVALID_COOKIE_SIGNATURE") {
            return failure(400, "Invalid cookie signature");
        }

        if (code === "NOT_FOUND") {
            return failure(404, "Not found");
        }

        logger.error("Unhandled API error", { error });
        return failure(500, "Internal server error");
    })
    .as("global");
