import { describe, expect, test } from "bun:test";

import { deserialize, serialize } from "../src/serialize";

const roundTrip = <T>(value: T) => deserialize<T>(serialize(value));

describe("cache serialization", () => {
    test("round-trips Dates and BigInts with their types", () => {
        const value = {
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            nested: [{ at: new Date(0) }],
            big: 2n ** 70n,
            plain: { $type: "Other", value: "kept" },
        };

        const restored = roundTrip(value);

        expect(restored.createdAt).toBeInstanceOf(Date);
        expect(restored).toEqual(value);
    });

    test("keeps an invalid Date invalid instead of throwing", () => {
        const restored = roundTrip({ at: new Date("nope") });

        expect(restored.at).toBeInstanceOf(Date);
        expect(Number.isNaN(restored.at.getTime())).toBe(true);
    });

    test("round-trips Uint8Array and Buffer", () => {
        const bytes = new Uint8Array([0, 1, 254, 255]);
        const sliced = new Uint8Array([9, 9, 1, 2, 3]).subarray(2);
        const buffer = Buffer.from("hello");

        const restored = roundTrip({ bytes, sliced, buffer });

        expect(restored.bytes).toBeInstanceOf(Uint8Array);
        expect(Buffer.isBuffer(restored.bytes)).toBe(false);
        expect(Array.from(restored.bytes)).toEqual([0, 1, 254, 255]);
        expect(Array.from(restored.sliced)).toEqual([1, 2, 3]);
        expect(Buffer.isBuffer(restored.buffer)).toBe(true);
        expect(restored.buffer.toString()).toBe("hello");
    });

    test("stores a Decimal-like value (toJSON) as its exact string", () => {
        // Shaped like Prisma.Decimal (decimal.js): `toJSON` returns the decimal text.
        const decimal = { d: [12, 5000000], e: 1, s: 1, toJSON: () => "12.50" };

        expect(roundTrip({ price: decimal })).toEqual({ price: "12.50" } as never);
    });

    test("never revives user data that looks like a tag", () => {
        const value = {
            legacy: { $type: "Date", value: "2026-01-01T00:00:00.000Z" },
            spoof: { "\u0000cache": "Date", v: "2026-01-01T00:00:00.000Z" },
            nestedSpoof: { "\u0000cache": "Object", v: { "\u0000cache": "BigInt", v: "1" } },
            shared: [] as unknown[],
        };
        const spoof = { "\u0000cache": "BigInt", v: "5" };
        value.shared.push(spoof, spoof);

        expect(roundTrip(value)).toEqual(value);
    });

    test("keeps __proto__ as a plain key", () => {
        const restored = deserialize<Record<string, unknown>>(
            '{"__proto__":{"\\u0000cache":"BigInt","v":"1"},"a":1}'
        );

        expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(restored, "__proto__")?.value).toBe(1n);
    });

    test("leaves ordinary JSON alone", () => {
        expect(roundTrip({ a: 1, b: ["x", null], c: "2026-01-01" })).toEqual({
            a: 1,
            b: ["x", null],
            c: "2026-01-01",
        });
        expect(roundTrip("text")).toBe("text");
        expect(roundTrip(new Date(5))).toEqual(new Date(5));
    });
});
