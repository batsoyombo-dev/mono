import { describe, expect, test } from "bun:test";

import { z } from "zod";

import {
    BadRequestError,
    ConflictError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    toAppError,
    ValidationError,
} from "../src";

/** Shaped like Prisma's PrismaClientKnownRequestError without loading Prisma. */
function prismaError(code: string, meta?: Record<string, unknown>) {
    return Object.assign(new Error(`Prisma ${code}`), {
        name: "PrismaClientKnownRequestError",
        code,
        meta,
    });
}

describe("toAppError", () => {
    test("passes AppErrors through", () => {
        const error = new ForbiddenError();
        expect(toAppError(error)).toBe(error);
    });

    test("maps zod errors to a ValidationError with dot paths", () => {
        const result = z.object({ user: z.object({ email: z.email() }) }).safeParse({
            user: { email: "nope" },
        });
        const appError = toAppError(result.error);

        expect(appError).toBeInstanceOf(ValidationError);
        expect(appError.statusCode).toBe(422);
        expect((appError as ValidationError).issues).toEqual([
            { path: "user.email", message: expect.any(String) },
        ]);
    });

    test("maps Prisma unique, not-found and foreign-key errors", () => {
        const conflict = toAppError(prismaError("P2002", { target: ["email"] }));
        expect(conflict).toBeInstanceOf(ConflictError);
        expect(conflict.message).toBe("A record with this email already exists");

        const adapter = toAppError(
            prismaError("P2002", {
                driverAdapterError: {
                    cause: { table: "users", constraint: { index: "users_email_key" } },
                },
            })
        );
        expect(adapter.message).toBe("A record with this email already exists");

        expect(toAppError(prismaError("P2025"))).toBeInstanceOf(NotFoundError);
        expect(toAppError(prismaError("P2003"))).toBeInstanceOf(BadRequestError);
    });

    test("maps PrismaClientValidationError to a generic 400", () => {
        const error = Object.assign(new Error("Invalid `prisma.user.findMany()` invocation: ..."), {
            name: "PrismaClientValidationError",
        });
        const appError = toAppError(error);

        expect(appError).toBeInstanceOf(BadRequestError);
        expect(appError.message).toBe("Invalid query");
    });

    test("maps a LockError from @mono/cache to a 409", () => {
        const error = Object.assign(new Error("Lock jobs:1 is held"), {
            name: "LockError",
            code: "LOCKED",
        });
        const appError = toAppError(error);

        expect(appError).toBeInstanceOf(ConflictError);
        expect(appError.statusCode).toBe(409);
    });

    test("wraps anything else as an untrusted 500 keeping the stack", () => {
        const original = new Error("boom");
        const appError = toAppError(original);

        expect(appError).toBeInstanceOf(InternalServerError);
        expect(appError.isTrusted).toBe(false);
        expect(appError.stack).toBe(original.stack);
        expect(toAppError("text").message).toContain("text");
    });
});
