import { describe, expect, test } from "bun:test";

import { parseFilters, parseListRouteInput } from "../src/utils/filters";

describe("parseFilters", () => {
    test("preserves all values for membership operators", () => {
        expect(
            parseFilters([
                { id: "status", type: "text", operator: "in", value: ["ACTIVE", "SUSPENDED"] },
                { id: "code", type: "text", operator: "notIn", value: ["A", "B"] },
            ])
        ).toEqual({
            AND: [{ status: { in: ["ACTIVE", "SUSPENDED"] } }, { code: { notIn: ["A", "B"] } }],
        });
    });

    test("supports inclusive ranges including zero", () => {
        expect(
            parseFilters([{ id: "amount", type: "number", operator: "between", value: [0, 100] }])
        ).toEqual({ amount: { gte: 0, lte: 100 } });
    });

    test("combines multiple filters on one field", () => {
        expect(
            parseFilters([
                { id: "name", type: "text", operator: "startsWith", value: "A" },
                { id: "name", type: "text", operator: "not", value: "Archived" },
            ])
        ).toEqual({
            AND: [
                { name: { startsWith: "A", mode: "insensitive" } },
                { name: { not: "Archived", mode: "insensitive" } },
            ],
        });
    });

    test("keeps text equality case-insensitive by default", () => {
        expect(
            parseFilters([{ id: "name", type: "text", operator: "equals", value: "Acme" }])
        ).toEqual({ name: { equals: "Acme", mode: "insensitive" } });

        expect(
            parseFilters([{ id: "status", type: "text", operator: "equals", value: "ACTIVE" }], {
                caseSensitiveFields: ["status"],
            })
        ).toEqual({ status: { equals: "ACTIVE" } });
    });

    test("accepts numeric epoch values for date filters", () => {
        const expected = new Date(1_700_000_000_000);
        expect(
            parseFilters([
                { id: "createdAt", type: "date", operator: "equals", value: 1_700_000_000_000 },
            ])
        ).toEqual({ createdAt: { equals: expected } });
    });

    test("supports boolean equality filters", () => {
        expect(
            parseFilters([{ id: "active", type: "boolean", operator: "equals", value: true }])
        ).toEqual({ active: { equals: true } });
    });
});

describe("parseListRouteInput", () => {
    test("rejects fields outside the endpoint allowlist", () => {
        expect(() =>
            parseListRouteInput(
                undefined,
                [{ id: "secret", type: "text", operator: "equals", value: "hidden" }],
                null,
                [],
                { filterFields: ["name"] }
            )
        ).toThrow("Filtering by secret is not allowed");
    });

    test("normalizes search and rejects unknown sort fields", () => {
        expect(
            parseListRouteInput(undefined, [], "  search  ", [], { sortFields: ["name"] })
        ).toMatchObject({ globalFilter: "search" });

        expect(() =>
            parseListRouteInput(undefined, [], null, [{ id: "secret", desc: false }], {
                sortFields: ["name"],
            })
        ).toThrow("Sorting by secret is not allowed");
    });
});
