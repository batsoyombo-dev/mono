/**
 * Base application error, carrying an HTTP status and a trust flag.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isTrusted: boolean;

    constructor(message: string, statusCode = 500, isTrusted = true, name = "AppError") {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = name;
        this.statusCode = statusCode;
        this.isTrusted = isTrusted;
        Error.captureStackTrace(this, this.constructor);
    }
}

/** 400 Bad Request */
export class BadRequestError extends AppError {
    constructor(message = "Bad request") {
        super(message, 400, true, "BadRequestError");
    }
}

/** 401 Unauthorized */
export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(message, 401, true, "UnauthorizedError");
    }
}

/** 403 Forbidden */
export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(message, 403, true, "ForbiddenError");
    }
}

/** 404 Not Found */
export class NotFoundError extends AppError {
    constructor(resource = "Resource") {
        super(`${resource} not found`, 404, true, "NotFoundError");
    }
}

/** 500 Internal Server Error */
export class InternalServerError extends AppError {
    constructor(message = "Internal server error") {
        super(message, 500, false, "InternalServerError");
    }
}

/** One failed field: a dot path (`""` for the whole input) and a human-readable message. */
export type ValidationIssue = {
    path: string;
    message: string;
};

/**
 * 422 Unprocessable Entity: input failed validation. Zod errors thrown by `schema.parse` are
 * converted to this automatically (see `toAppError`), so services can call `parse` directly.
 */
export class ValidationError extends AppError {
    public readonly issues: ValidationIssue[];

    constructor(message = "Validation failed", issues: ValidationIssue[] = []) {
        super(message, 422, true, "ValidationError");
        this.issues = issues;
    }
}

/** 409 Conflict — stale optimistic lock, invalid workflow transition, or a unique-constraint race */
export class ConflictError extends AppError {
    constructor(message = "Conflict") {
        super(message, 409, true, "ConflictError");
    }
}
