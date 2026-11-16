import { describe, expect, test } from "bun:test";

import type { Redis } from "ioredis";

import { LockError } from "../src/errors";
import { RedisCache } from "../src/redis-cache";

/**
 * In-memory stand-in for the ioredis commands RedisCache uses (no TTL bookkeeping). `eval`
 * only understands the lock-release script.
 */
function fakeRedis() {
    const store = new Map<string, string>();
    const evals: unknown[][] = [];
    const client = {
        store,
        evals,
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string, ...args: unknown[]) => {
            if (args.includes("NX") && store.has(key)) return null;
            store.set(key, value);
            return "OK";
        },
        del: async (...keys: string[]) => keys.filter((key) => store.delete(key)).length,
        exists: async (key: string) => (store.has(key) ? 1 : 0),
        eval: async (script: string, _keys: number, key: string, ...args: unknown[]) => {
            evals.push([key, ...args]);
            if (script.includes('redis.call("del"')) {
                if (store.get(key) !== args[0]) return 0;
                store.delete(key);
                return 1;
            }
            return [1, Number(args[0])];
        },
    };
    return client;
}

function setup() {
    const client = fakeRedis();
    const cache = new RedisCache({ url: "", prefix: "t:", client: client as unknown as Redis });
    return { client, cache };
}

describe("RedisCache.remember", () => {
    test("shares one fetch between concurrent misses and caches the value", async () => {
        const { cache, client } = setup();
        let calls = 0;
        const fetcher = async () => {
            calls++;
            await Bun.sleep(5);
            return { n: calls };
        };

        const [a, b] = await Promise.all([
            cache.remember("k", 1000, fetcher),
            cache.remember("k", 1000, fetcher),
        ]);

        expect(a).toEqual({ n: 1 });
        expect(b).toEqual({ n: 1 });
        expect(calls).toBe(1);
        expect(client.store.has("t:k")).toBe(true);
    });

    test("a fetcher that throws synchronously does not poison the key", async () => {
        const { cache } = setup();
        const throwing = (() => {
            throw new Error("sync boom");
        }) as unknown as () => Promise<number>;

        await expect(cache.remember("k", 1000, throwing)).rejects.toThrow("sync boom");

        expect(await cache.remember("k", 1000, async () => 42)).toBe(42);
    });

    test("a rejected fetch is not cached and the next call retries", async () => {
        const { cache } = setup();

        await expect(
            cache.remember("k", 1000, () => Promise.reject(new Error("down")))
        ).rejects.toThrow("down");

        expect(await cache.remember("k", 1000, async () => "ok")).toBe("ok");
    });
});

describe("RedisCache.withLock", () => {
    test("runs fn and releases the lock", async () => {
        const { cache, client } = setup();

        expect(await cache.withLock("job", 1000, async () => "done")).toBe("done");
        expect(client.store.has("t:lock:job")).toBe(false);
    });

    test("throws LockError LOCKED when the lock is held", async () => {
        const { cache } = setup();
        const token = await cache.acquireLock("job", 1000);
        expect(token).not.toBeNull();

        const error = await cache
            .withLock("job", 1000, async () => "never")
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(LockError);
        expect(error).toMatchObject({ name: "LockError", code: "LOCKED", key: "job" });
    });

    test("throws LockError LOCK_TIMEOUT when waiting runs out", async () => {
        const { cache } = setup();
        await cache.acquireLock("job", 1000);

        const error = await cache
            .withLock("job", 1000, async () => "never", {
                wait: true,
                waitTimeoutMs: 20,
                pollIntervalMs: 5,
            })
            .catch((e: unknown) => e);

        expect(error).toMatchObject({ name: "LockError", code: "LOCK_TIMEOUT" });
    });

    test("releases the lock when fn throws", async () => {
        const { cache, client } = setup();

        await expect(
            cache.withLock("job", 1000, () => Promise.reject(new Error("fail")))
        ).rejects.toThrow("fail");

        expect(client.store.has("t:lock:job")).toBe(false);
    });
});

describe("RedisCache.consumeRateLimit", () => {
    test("rounds windowMs and rejects non-positive values", async () => {
        const { cache, client } = setup();

        await cache.consumeRateLimit("ip", { windowMs: 1000.6, max: 1 });
        expect(client.evals.at(-1)).toEqual(["t:ratelimit:ip", 1001]);

        for (const windowMs of [0, -5, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) {
            await expect(cache.consumeRateLimit("ip", { windowMs, max: 1 })).rejects.toThrow(
                RangeError
            );
        }
    });
});
