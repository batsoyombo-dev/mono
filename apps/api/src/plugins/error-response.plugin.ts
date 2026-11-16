import { Elysia } from "elysia";

import type { ValidationIssue } from "@mono/error-handling";
import { toAppError, ValidationError } from "@mono/error-handling";
import { logger } from "@mono/logger";

import { getRequestId } from "./request-context.plugin";
import { failure } from "../utils/response";

type ElysiaIssue = { path?: unknown; message?: unknown; summary?: unknown };

/** Elysia's validation issues, without the `value` field (it echoes the whole request body). */
function elysiaIssues(error: unknown): ValidationIssue[] {
    const all = (error as { all?: unknown }).all;
    if (!Array.isArray(all)) return [];

    return (all as ElysiaIssue[]).map((issue) => ({
        path: String(issue.path ?? "")
            .replace(/^\//, "")
            .replaceAll("/", "."),
        message: String(issue.message ?? issue.summary ?? "Invalid value"),
    }));
}

/**
 * Turns every error into the failure envelope. AppErrors keep their status; zod and Prisma
 * errors are mapped by `toAppError` (422, 409, 404, 400). Anything else is logged and returned
 * as a generic 500, so internal messages never reach the client.
 */
function toResponse(code: unknown, error: unknown, request: Request): Response {
    switch (code) {
        case "VALIDATION":
            return failure(422, "Validation failed", elysiaIssues(error));
        case "PARSE":
            return failure(400, "Malformed request body");
        case "INVALID_COOKIE_SIGNATURE":
            return failure(400, "Invalid cookie signature");
        case "NOT_FOUND":
            return failure(404, "Not found");
        default:
            // Thrown by our code (or Elysia's internals): mapped below.
            break;
    }

    const appError = toAppError(error);

    if (appError.statusCode >= 500) {
        logger.error("Unhandled API error", {
            error: appError,
            requestId: getRequestId(request),
            method: request.method,
            path: new URL(request.url).pathname,
        });
        return failure(500, "Internal server error");
    }

    if (appError instanceof ValidationError) {
        return failure(appError.statusCode, appError.message, appError.issues);
    }

    return failure(appError.statusCode, appError.message);
}

export const errorResponsePlugin = new Elysia({ name: "ErrorResponse" })
    .onError(({ code, error, request, set }) => {
        const response = toResponse(code, error, request);
        // Keep Elysia's view of the status in sync, so the request log reports what was sent.
        set.status = response.status;
        return response;
    })
    .as("global");
