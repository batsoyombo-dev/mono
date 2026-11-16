import { describe, expect, test } from "bun:test";

import { ValidationError } from "@mono/error-handling";
import type { Filter } from "@mono/utils";

import type { ListFieldOptions } from "../src/utils/filters";
import { parseFilters, parseListRouteInput, parseSorts } from "../src/utils/filters";

const all = {
    filterFields: {
        status: "text",
        code: "text",
        amount: "number",
        name: "text",
        createdAt: "date",
        archivedAt: "date",
        active: "boolean",
        "user.name": "text",
    },
    nullableFields: ["archivedAt", "code"],
} satisfies Pick<ListFieldOptions, "filterFields" | "nullableFields">;

/** The ValidationError thrown by `fn`, so tests can check its issue path. */
function validationError(fn: () => unknown): ValidationError {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        return error as ValidationError;
    }
    throw new Error("Expected a ValidationError");
}

describe("parseFilters", () => {
    test("preserves all values for membership operators", () => {
        expect(
            parseFilters(
                [
                    { id: "status", type: "text", operator: "in", value: ["ACTIVE", "SUSPENDED"] },
                    { id: "code", type: "text", operator: "notIn", value: ["A", "B"] },
                ],
                all
            )
        ).toEqual({
            AND: [
                { status: { in: ["ACTIVE", "SUSPENDED"], mode: "insensitive" } },
                { code: { notIn: ["A", "B"], mode: "insensitive" } },
            ],
        });
    });

    test("number and date values are parsed strictly", () => {
        const one = (filter: Record<string, unknown>) => () =>
            parseFilters([filter as Parameters<typeof parseFilters>[0][number]], all);

        for (const value of [" ", "0x10", "1e", "abc", true]) {
            expect(one({ id: "amount", operator: "equals", value })).toThrow();
        }
        expect(one({ id: "amount", operator: "equals", value: "12.5" })()).toEqual({
            amount: { equals: 12.5 },
        });

        // Time zone-dependent strings are rejected; ISO with a zone, dates and epochs are fine.
        for (const value of ["2024-01-01 10:00", "2024-01-01T10:00", "Jan 1 2024", "12/01"]) {
            expect(one({ id: "createdAt", operator: "gte", value })).toThrow();
        }
        const iso = "2024-01-01T10:00:00Z";
        expect(one({ id: "createdAt", operator: "gte", value: iso })()).toEqual({
            createdAt: { gte: new Date(iso) },
        });
        expect(one({ id: "createdAt", operator: "gte", value: "0" })()).toEqual({
            createdAt: { gte: new Date(0) },
        });
    });

    test("supports inclusive ranges including zero", () => {
        expect(
            parseFilters(
                [{ id: "amount", type: "number", operator: "between", value: [0, 100] }],
                all
            )
        ).toEqual({ amount: { gte: 0, lte: 100 } });
    });

    test("combines multiple filters on one field", () => {
        expect(
            parseFilters(
                [
                    { id: "name", type: "text", operator: "startsWith", value: "A" },
                    { id: "name", type: "text", operator: "not", value: "Archived" },
                ],
                all
            )
        ).toEqual({
            AND: [
                { name: { startsWith: "A", mode: "insensitive" } },
                { name: { not: "Archived", mode: "insensitive" } },
            ],
        });
    });

    test("keeps text equality case-insensitive by default", () => {
        expect(
            parseFilters([{ id: "name", type: "text", operator: "equals", value: "Acme" }], all)
        ).toEqual({ name: { equals: "Acme", mode: "insensitive" } });

        expect(
            parseFilters([{ id: "status", type: "text", operator: "equals", value: "ACTIVE" }], {
                ...all,
                caseSensitiveFields: ["status"],
            })
        ).toEqual({ status: { equals: "ACTIVE" } });
    });

    test("accepts numeric epoch values for date filters", () => {
        const expected = new Date(1_700_000_000_000);
        expect(
            parseFilters(
                [{ id: "createdAt", type: "date", operator: "equals", value: 1_700_000_000_000 }],
                all
            )
        ).toEqual({ createdAt: { equals: expected } });
    });

    test("supports boolean equality filters", () => {
        expect(
            parseFilters([{ id: "active", type: "boolean", operator: "equals", value: true }], all)
        ).toEqual({ active: { equals: true } });
    });

    test("nests relation paths", () => {
        expect(
            parseFilters(
                [{ id: "user.name", type: "text", operator: "contains", value: "ada" }],
                all
            )
        ).toEqual({ user: { name: { contains: "ada", mode: "insensitive" } } });
    });

    test("rejects a client type that disagrees with the server's type", () => {
        const error = validationError(() =>
            parseFilters([{ id: "active", type: "text", operator: "contains", value: "yes" }], all)
        );
        expect(error.issues).toEqual([
            { path: "filters.0.type", message: "active is a boolean field" },
        ]);
    });

    test("rejects operators that do not fit the field's type", () => {
        const cases: Filter[] = [
            { id: "active", type: "boolean", operator: "contains", value: true },
            { id: "amount", type: "number", operator: "startsWith", value: 1 },
            { id: "name", type: "text", operator: "between", value: ["a", "z"] },
            { id: "createdAt", type: "date", operator: "contains", value: "2026" },
        ];
        for (const filter of cases) {
            const error = validationError(() => parseFilters([filter], all));
            expect(error.issues[0]?.path).toBe("filters.0.operator");
        }
    });

    test("rejects values of the wrong shape or type", () => {
        const cases: [Filter, string][] = [
            [{ id: "amount", type: "number", operator: "in", value: 5 }, "filters.0.value"],
            [{ id: "amount", type: "number", operator: "equals", value: [1] }, "filters.0.value"],
            [{ id: "amount", type: "number", operator: "gt", value: "abc" }, "filters.0.value"],
            [
                { id: "active", type: "boolean", operator: "equals", value: "true" },
                "filters.0.value",
            ],
            [
                { id: "createdAt", type: "date", operator: "gte", value: "not a date" },
                "filters.0.value",
            ],
            [{ id: "amount", type: "number", operator: "between", value: [1] }, "filters.0.value"],
        ];
        for (const [filter, path] of cases) {
            expect(validationError(() => parseFilters([filter], all)).issues[0]?.path).toBe(path);
        }
    });

    test("blank compares with null only on nullable fields", () => {
        expect(
            parseFilters([{ id: "archivedAt", type: "date", operator: "blank", value: "" }], all)
        ).toEqual({ archivedAt: null });
        expect(
            parseFilters([{ id: "archivedAt", type: "date", operator: "notBlank", value: "" }], all)
        ).toEqual({ archivedAt: { not: null } });

        // A required column cannot be compared with null: a 422, never a Prisma 500.
        const error = validationError(() =>
            parseFilters([{ id: "createdAt", type: "date", operator: "blank", value: "" }], all)
        );
        expect(error.issues[0]?.path).toBe("filters.0.operator");
        expect(() =>
            parseFilters([{ id: "active", type: "boolean", operator: "notBlank", value: "" }], all)
        ).toThrow(ValidationError);
    });

    test("blank on text matches the empty string, and null when the field is nullable", () => {
        expect(
            parseFilters([{ id: "name", type: "text", operator: "blank", value: "" }], all)
        ).toEqual({ name: { equals: "" } });
        expect(
            parseFilters([{ id: "code", type: "text", operator: "blank", value: "" }], all)
        ).toEqual({ OR: [{ code: { equals: "" } }, { code: null }] });
        expect(
            parseFilters([{ id: "code", type: "text", operator: "notBlank", value: "" }], all)
        ).toEqual({ AND: [{ code: { not: "" } }, { code: { not: null } }] });
    });

    test("ignores empty membership selections", () => {
        expect(
            parseFilters([{ id: "status", type: "text", operator: "in", value: [] }], all)
        ).toEqual({});
    });

    test("bounds the number of filters, array values and text length", () => {
        const many = Array.from({ length: 21 }, (): Filter => ({
            id: "name",
            type: "text",
            operator: "equals",
            value: "x",
        }));
        expect(validationError(() => parseFilters(many, all)).issues[0]?.path).toBe("filters");

        const values = Array.from({ length: 101 }, (_, index) => String(index));
        expect(
            validationError(() =>
                parseFilters([{ id: "status", type: "text", operator: "in", value: values }], all)
            ).issues[0]?.path
        ).toBe("filters.0.value");

        expect(() =>
            parseFilters(
                [{ id: "name", type: "text", operator: "contains", value: "x".repeat(501) }],
                all
            )
        ).toThrow(ValidationError);
    });

    test("rejects prototype keys even when allowlisted", () => {
        expect(() =>
            parseFilters([{ id: "__proto__.x", type: "text", operator: "equals", value: "x" }], {
                filterFields: { "__proto__.x": "text" },
            })
        ).toThrow(ValidationError);
    });
});

describe("parseSorts", () => {
    test("builds nested objects for relation paths", () => {
        expect(
            parseSorts(
                [
                    { id: "user.name", desc: false },
                    { id: "createdAt", desc: true },
                ],
                ["user.name", "createdAt"]
            )
        ).toEqual([{ user: { name: "asc" } }, { createdAt: "desc" }]);
    });

    test("drops duplicates and rejects unknown fields", () => {
        expect(
            parseSorts(
                [
                    { id: "name", desc: false },
                    { id: "name", desc: true },
                ],
                ["name"]
            )
        ).toEqual([{ name: "asc" }]);
        expect(() => parseSorts([{ id: "secret", desc: false }], ["name"])).toThrow(
            ValidationError
        );
    });
});

describe("parseListRouteInput", () => {
    const options: ListFieldOptions = {
        filterFields: { name: "text" },
        sortFields: ["name", "id"],
    };

    test("rejects filter fields outside the endpoint allowlist", () => {
        expect(() =>
            parseListRouteInput(
                { filters: [{ id: "secret", type: "text", operator: "equals", value: "hidden" }] },
                options
            )
        ).toThrow("Invalid list request");
    });

    test("rejects relation paths that are not allowlisted", () => {
        const error = validationError(() =>
            parseListRouteInput(
                {
                    filters: [
                        {
                            id: "accounts.some.password",
                            type: "text",
                            operator: "startsWith",
                            value: "$",
                        },
                    ],
                },
                options
            )
        );
        expect(error.issues).toEqual([
            { path: "filters.0.id", message: "Filtering by accounts.some.password is not allowed" },
        ]);
    });

    test("normalizes search, pagination and sorts, appending an id tiebreaker", () => {
        expect(
            parseListRouteInput(
                { globalFilter: "  search  ", sorts: [{ id: "name", desc: true }] },
                options
            )
        ).toEqual({
            filters: {},
            globalFilter: "search",
            pagination: { page: 1, pageSize: 20, skip: 0 },
            sorts: [{ name: "desc" }, { id: "desc" }],
        });
    });

    test("uses the default sorts when none are sent, and keeps an explicit id sort", () => {
        const withDefaults = { ...options, defaultSorts: [{ name: "asc" }] };
        expect(parseListRouteInput({}, withDefaults).sorts).toEqual([
            { name: "asc" },
            { id: "desc" },
        ]);
        expect(parseListRouteInput({}, options).sorts).toEqual([{ id: "desc" }]);
        expect(
            parseListRouteInput({ sorts: [{ id: "id", desc: false }] }, withDefaults).sorts
        ).toEqual([{ id: "asc" }]);
        expect(
            parseListRouteInput({}, { ...options, tiebreaker: { field: "uuid", direction: "asc" } })
                .sorts
        ).toEqual([{ uuid: "asc" }]);
        expect(parseListRouteInput({}, { ...options, tiebreaker: null }).sorts).toEqual([]);
    });

    test("rejects unknown sort fields", () => {
        const error = validationError(() =>
            parseListRouteInput({ sorts: [{ id: "secret", desc: false }] }, options)
        );
        expect(error.issues[0]).toEqual({
            path: "sorts.0.id",
            message: "Sorting by secret is not allowed",
        });
    });

    test("bounds the search, page and page size", () => {
        expect(
            validationError(() => parseListRouteInput({ globalFilter: "x".repeat(201) }, options))
                .issues[0]?.path
        ).toBe("globalFilter");
        expect(
            validationError(() =>
                parseListRouteInput({ pagination: { page: 10_001, pageSize: 20 } }, options)
            ).issues[0]?.path
        ).toBe("pagination.page");
        expect(
            validationError(() =>
                parseListRouteInput({ pagination: { page: 1, pageSize: 101 } }, options)
            ).issues[0]?.path
        ).toBe("pagination.pageSize");
        expect(
            parseListRouteInput(
                { pagination: { page: 1, pageSize: 500 } },
                { ...options, limits: { maxPageSize: 500 } }
            ).pagination
        ).toEqual({ page: 1, pageSize: 500, skip: 0 });
    });
});
