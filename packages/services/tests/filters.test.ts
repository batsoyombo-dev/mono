import { describe, expect, test } from "bun:test";

import { parseFilters } from "../src/utils/filters";

describe("parseFilters", () => {
    test("builds nested Prisma filters", () => {
        expect(
            parseFilters([
                {
                    id: "user.email",
                    value: "@example.com",
                    type: "text",
                    operator: "contains",
                },
            ])
        ).toEqual({
            user: {
                email: {
                    contains: "@example.com",
                    mode: "insensitive",
                },
            },
        });
    });

    test("ignores prototype-polluting paths", () => {
        expect(
            parseFilters([
                {
                    id: "__proto__.polluted",
                    value: "true",
                    type: "text",
                    operator: "equals",
                },
            ])
        ).toEqual({});
        expect({}).not.toHaveProperty("polluted");
    });
});
