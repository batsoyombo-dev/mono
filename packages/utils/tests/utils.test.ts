import { describe, expect, test } from "bun:test";

import { chunk, formatBytes, isEqual, truncate } from "../src";

describe("isEqual", () => {
    test("objects of different kinds are not equal", () => {
        expect(isEqual([], {})).toBe(false);
        expect(isEqual({}, [])).toBe(false);
        expect(isEqual(new Date(0), {})).toBe(false);
        expect(isEqual({}, new Date(0))).toBe(false);
        expect(isEqual(new Map(), {})).toBe(false);
        expect(isEqual(new Set(), [])).toBe(false);
        expect(isEqual(/a/, {})).toBe(false);
    });

    test("compares values of the same kind deeply", () => {
        expect(isEqual({ a: [1, { b: new Date(5) }] }, { a: [1, { b: new Date(5) }] })).toBe(true);
        expect(isEqual(new Map([["k", { v: 1 }]]), new Map([["k", { v: 1 }]]))).toBe(true);
        expect(isEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
        expect(isEqual(Number.NaN, Number.NaN)).toBe(true);
        expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
    });
});

describe("chunk", () => {
    test("splits into chunks", () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(chunk([], 3)).toEqual([]);
    });

    test("rejects sizes below 1 instead of looping forever", () => {
        for (const size of [0, -1, 0.5, Number.NaN]) {
            expect(() => chunk([1, 2], size)).toThrow(RangeError);
        }
    });
});

describe("truncate", () => {
    test("never exceeds the requested length", () => {
        expect(truncate("hello world", 8)).toBe("hello...");
        expect(truncate("hello world", 3)).toBe("hel");
        expect(truncate("hello world", 2)).toBe("he");
        expect(truncate("hello world", 0)).toBe("");
        expect(truncate("hello world", -4)).toBe("");
        expect(truncate("hello", 5)).toBe("hello");
        for (let length = 0; length < 12; length++) {
            expect(truncate("hello world", length).length).toBeLessThanOrEqual(length);
        }
    });
});

describe("formatBytes", () => {
    test("formats byte counts with a unit", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(-1)).toBe("0 B");
        expect(formatBytes(Number.NaN)).toBe("0 B");
        expect(formatBytes(0.5)).toBe("0.5 B");
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(1536)).toBe("1.5 KB");
        expect(formatBytes(1024 ** 5)).toBe("1024 TB");
    });
});
