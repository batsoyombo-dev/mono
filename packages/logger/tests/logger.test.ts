import { describe, expect, test } from "bun:test";

import { defaultLogLevel, runtimeConfig } from "@mono/env/runtime";

import { formatPrettyLine, logger, serializeMetaValue } from "../src";

describe("serializeMetaValue", () => {
    test("expands nested errors, their cause and own fields", () => {
        const root = new Error("socket closed");
        const error = Object.assign(new Error("Payment failed", { cause: root }), {
            status: 502,
            code: "UPSTREAM",
        });

        const result = serializeMetaValue({ context: { errors: [error] } }) as {
            context: { errors: Record<string, unknown>[] };
        };
        const serialized = result.context.errors[0];

        expect(serialized).toMatchObject({
            name: "Error",
            message: "Payment failed",
            status: 502,
            code: "UPSTREAM",
            cause: { name: "Error", message: "socket closed" },
        });
        expect(typeof serialized?.stack).toBe("string");
    });

    test("renders BigInt as a string", () => {
        expect(serializeMetaValue({ id: 12345678901234567890n })).toEqual({
            id: "12345678901234567890",
        });
    });

    test("survives cyclic errors", () => {
        const error = new Error("loop") as Error & { self?: unknown };
        error.self = error;
        expect(() => serializeMetaValue({ error })).not.toThrow();
    });
});

describe("formatPrettyLine", () => {
    test("never throws on BigInt or circular metadata", () => {
        const meta: Record<string, unknown> = { amount: 10n };
        meta.self = meta;

        const line = formatPrettyLine({
            level: "info",
            message: "hello",
            timestamp: "t",
            ...meta,
        });

        expect(line).toContain('"amount":"10"');
        expect(line).toContain("[Circular]");
    });

    test("BigInt nested in a class instance becomes a string", () => {
        class Box {
            value = 7n;
        }
        const line = formatPrettyLine({
            level: "info",
            message: "m",
            timestamp: "t",
            box: new Box(),
        });
        expect(line).toContain('"value":"7"');
    });
});

describe("log level", () => {
    test("defaults to warn under NODE_ENV=test unless LOG_LEVEL is set", () => {
        // `bun test` sets NODE_ENV=test; the root `test` script loads no .env.
        expect(runtimeConfig.NODE_ENV).toBe("test");
        expect(defaultLogLevel).toBe("warn");
        expect(logger.level).toBe(runtimeConfig.LOG_LEVEL);
    });
});
