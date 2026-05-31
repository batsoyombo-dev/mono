/* eslint-disable @typescript-eslint/no-explicit-any */
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

/** 404 Not Found */
export class NotFoundError extends AppError {
    constructor(resource = "Resource") {
        super(`${resource} not found`, 404, true, "NotFoundError");
    }
}

/** 500 Internal Server Error */
export class InternalServerError extends AppError {
    constructor(message = "Internal server error") {
        super(message, 500, true, "InternalServerError");
    }
}

/**
 * 422 Unprocessable Entity — validation failure
 * Use this to throw when request-body or parameter validation fails.
 */
export class ValidationError extends AppError {
    /** details about which fields failed and why */
    public readonly errors: Record<string, any>;

    constructor(message = "Validation failed", errors: Record<string, any> = {}) {
        super(message, 422, true, "ValidationError");
        this.errors = errors;
    }
}
