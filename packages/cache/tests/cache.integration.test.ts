/**
 * Runs against a real Redis (`bun run infra:up`). Run with `bun run test:integration`;
 * `bun run test` skips it. Uses a unique key prefix and flushes only that prefix afterwards.
 */
import { afterAll, describe, expect, test } from "bun:test";

import { defineEnv } from "@mono/env";

import { RedisCache } from "../src";

const config = defineEnv("integration-tests", { groups: ["redis"] });
const cache = new RedisCache({
    url: config.REDIS_URL,
    prefix: `it-${crypto.randomUUID().slice(0, 8)}:`,
});

afterAll(async () => {
    await cache.flush();
    await cache.disconnect();
});

describe("RedisCache (Redis)", () => {
    test("stores JSON values and forgets them", async () => {
        await cache.set("user", { id: 1, tags: ["a"] });

        expect(await cache.get("user")).toEqual({ id: 1, tags: ["a"] });
        expect(await cache.has("user")).toBe(true);

        await cache.forget("user");
        expect(await cache.get("user")).toBeNull();
    });

    test("remember calls the fetcher once and serves the cached value after", async () => {
        let calls = 0;
        const fetcher = async () => ({ value: ++calls });

        expect(await cache.remember("remembered", 60_000, fetcher)).toEqual({ value: 1 });
        expect(await cache.remember("remembered", 60_000, fetcher)).toEqual({ value: 1 });
        expect(calls).toBe(1);
    });

    test("withLock rejects a second holder and releases after the first finishes", async () => {
        let release!: () => void;
        const held = cache.withLock(
            "job",
            5_000,
            () => new Promise<string>((resolve) => (release = () => resolve("first")))
        );
        await Bun.sleep(50);

        await expect(cache.withLock("job", 5_000, async () => "second")).rejects.toThrow("LOCKED:");

        release();
        expect(await held).toBe("first");
        expect(await cache.withLock("job", 5_000, async () => "third")).toBe("third");
    });
});
