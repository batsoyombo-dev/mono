import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { NotFoundError, ValidationError } from "@mono/error-handling";

import { formatCliError, parseDuration, parseInteger } from "../src/cli-args";

describe("parseDuration", () => {
    test("reads units and plain milliseconds", () => {
        expect(parseDuration(undefined)).toBeUndefined();
        expect(parseDuration("250")).toBe(250);
        expect(parseDuration("500ms")).toBe(500);
        expect(parseDuration("30s")).toBe(30_000);
        expect(parseDuration("5m")).toBe(300_000);
        expect(parseDuration(" 2h ")).toBe(7_200_000);
        expect(parseDuration("1d")).toBe(86_400_000);
    });

    test("rejects anything else with a ValidationError naming the flag", () => {
        for (const value of ["", "1.5s", "-1s", "10 minutes", "s", "1w"]) {
            expect(() => parseDuration(value, "delay")).toThrow(ValidationError);
        }
        expect(() => parseDuration("soon", "older-than")).toThrow('Invalid --older-than "soon"');
        expect(() => parseDuration("99999999999999999d")).toThrow(ValidationError);
    });
});

describe("parseInteger", () => {
    test("reads whole numbers and rejects the rest", () => {
        expect(parseInteger(undefined, "page")).toBeUndefined();
        expect(parseInteger("3", "page")).toBe(3);
        expect(parseInteger("-2", "priority")).toBe(-2);
        expect(() => parseInteger("abc", "page")).toThrow(
            '--page must be a whole number, got "abc"'
        );
        expect(() => parseInteger("1.5", "limit")).toThrow(ValidationError);
        expect(() => parseInteger("", "limit")).toThrow(ValidationError);
    });
});

describe("formatCliError", () => {
    test("prints a zod error's issues as lines, not raw JSON", () => {
        const zodError = z.object({ page: z.number() }).safeParse({ page: "x" }).error;

        const output = formatCliError(zodError);

        expect(output).toStartWith("Error: Validation failed\n  - page: ");
        expect(output).not.toContain("[");
    });

    test("prints other errors as one line", () => {
        expect(formatCliError(new NotFoundError("Job"))).toBe("Error: Job not found");
        expect(formatCliError(new ValidationError("Missing <queue>."))).toBe(
            "Error: Missing <queue>."
        );
    });
});
