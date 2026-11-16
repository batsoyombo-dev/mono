import { describe, expect, test } from "bun:test";

import { deserialize, serialize } from "../src/serialize";

describe("cache serialization", () => {
    test("round-trips Dates and BigInts with their types", () => {
        const value = {
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            nested: [{ at: new Date(0) }],
            big: 2n ** 70n,
            plain: { $type: "Other", value: "kept" },
        };

        const restored = deserialize<typeof value>(serialize(value));

        expect(restored.createdAt).toBeInstanceOf(Date);
        expect(restored).toEqual(value);
    });

    test("leaves ordinary JSON alone", () => {
        expect(deserialize(serialize({ a: 1, b: ["x", null], c: "2026-01-01" }))).toEqual({
            a: 1,
            b: ["x", null],
            c: "2026-01-01",
        });
    });
});
