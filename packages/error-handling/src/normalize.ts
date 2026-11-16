import { inspect } from "node:util";

import { logger } from "@mono/logger";

import type { ValidationIssue } from "./exceptions";
import {
    AppError,
    BadRequestError,
    ConflictError,
    InternalServerError,
    NotFoundError,
    ValidationError,
} from "./exceptions";

type IssueLike = { path?: readonly PropertyKey[]; message: string };

/** Converts zod (or any Standard Schema) issues to `ValidationIssue`s. */
export function toValidationIssues(issues: readonly IssueLike[]): ValidationIssue[] {
    return issues.map((issue) => ({
        path: (issue.path ?? []).map(String).join("."),
        message: issue.message,
    }));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

// Duck-typed so this package needs neither zod nor Prisma; both keep stable error names.
function isZodError(error: unknown): error is Error & { issues: IssueLike[] } {
    return (
        error instanceof Error &&
        error.name === "ZodError" &&
        Array.isArray((error as { issues?: unknown }).issues)
    );
}

function isPrismaKnownError(
    error: unknown
): error is Error & { code: string; meta?: Record<string, unknown> } {
    return (
        error instanceof Error &&
        error.name === "PrismaClientKnownRequestError" &&
        typeof (error as { code?: unknown }).code === "string"
    );
}

function isPrismaValidationError(error: unknown): error is Error {
    return error instanceof Error && error.name === "PrismaClientValidationError";
}

/**
 * `LockError` from `@mono/cache` (`withLock` could not acquire the lock). Matched by name and
 * code because this package may not import `@mono/cache`.
 */
function isLockError(error: unknown): error is Error {
    if (!(error instanceof Error) || error.name !== "LockError") return false;
    const code = (error as { code?: unknown }).code;
    return code === "LOCKED" || code === "LOCK_TIMEOUT";
}

function uniqueFields(meta: Record<string, unknown> | undefined): string {
    const target = meta?.target;
    if (Array.isArray(target)) return target.join(", ");
    if (typeof target === "string") return target;

    // Driver adapters (@prisma/adapter-pg) report the constraint instead:
    // `{ table: "users", constraint: { index: "users_email_key" } }` or `{ fields: [...] }`.
    const cause = isObject(meta?.driverAdapterError) ? meta.driverAdapterError.cause : undefined;
    const constraint = isObject(cause) && isObject(cause.constraint) ? cause.constraint : null;
    if (Array.isArray(constraint?.fields)) return constraint.fields.join(", ");

    const index = typeof constraint?.index === "string" ? constraint.index : "";
    const table = isObject(cause) && typeof cause.table === "string" ? cause.table : "";
    const match = table ? new RegExp(`^${table}_(.+)_key$`).exec(index) : null;
    return match?.[1] ?? "";
}

/**
 * Maps anything thrown to an `AppError`:
 * - `AppError` subclasses pass through.
 * - `ZodError` (from `schema.parse`) becomes `ValidationError` (422).
 * - Prisma P2002 (unique) becomes `ConflictError` (409), P2025 (record not found) `NotFoundError`
 *   (404), P2003 (foreign key) `BadRequestError` (400).
 * - Prisma `PrismaClientValidationError` (a malformed query) becomes `BadRequestError` (400)
 *   with a generic message; the details are logged, never sent.
 * - `LockError` from `@mono/cache` (`withLock` found the lock taken) becomes `ConflictError` (409).
 * - Anything else becomes an untrusted `InternalServerError` (500) keeping the original stack.
 */
export function toAppError(error: unknown): AppError {
    if (error instanceof AppError) return error;

    if (isZodError(error)) {
        return new ValidationError("Validation failed", toValidationIssues(error.issues));
    }

    if (isPrismaKnownError(error)) {
        switch (error.code) {
            case "P2002": {
                const fields = uniqueFields(error.meta);
                return new ConflictError(
                    fields ? `A record with this ${fields} already exists` : "Record already exists"
                );
            }
            case "P2025":
                return new NotFoundError("Record");
            case "P2003":
                return new BadRequestError("A related record does not exist");
        }
    }

    if (isPrismaValidationError(error)) {
        logger.warn("Prisma rejected the query", { error });
        return new BadRequestError("Invalid query");
    }

    if (isLockError(error)) {
        return new ConflictError("The resource is busy, try again later");
    }

    if (error instanceof Error) {
        const appError = new InternalServerError(error.message);
        appError.stack = error.stack;
        return appError;
    }

    return new InternalServerError(`Non-error value thrown: ${inspect(error)}`);
}
