import { describe, expect, test } from "bun:test";

import { parseFilters, parseListRouteInput } from "../src/utils/filters";

const all = {
    filterFields: ["status", "code", "amount", "name", "createdAt", "active"],
};

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
            AND: [{ status: { in: ["ACTIVE", "SUSPENDED"] } }, { code: { notIn: ["A", "B"] } }],
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
});

describe("parseListRouteInput", () => {
    const options = { filterFields: ["name"], sortFields: ["name"] };

    test("rejects filter fields outside the endpoint allowlist", () => {
        expect(() =>
            parseListRouteInput(
                { filters: [{ id: "secret", type: "text", operator: "equals", value: "hidden" }] },
                options
            )
        ).toThrow("Filtering by secret is not allowed");
    });

    test("rejects relation paths that are not allowlisted", () => {
        expect(() =>
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
        ).toThrow("Filtering by accounts.some.password is not allowed");
    });

    test("normalizes search, pagination and sorts", () => {
        expect(
            parseListRouteInput(
                { globalFilter: "  search  ", sorts: [{ id: "name", desc: true }] },
                options
            )
        ).toEqual({
            filters: {},
            globalFilter: "search",
            pagination: { page: 1, pageSize: 20, skip: 0 },
            sorts: [{ name: "desc" }],
        });
    });

    test("rejects unknown sort fields", () => {
        expect(() =>
            parseListRouteInput({ sorts: [{ id: "secret", desc: false }] }, options)
        ).toThrow("Sorting by secret is not allowed");
    });
});
