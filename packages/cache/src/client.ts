import { randomUUID } from "node:crypto";

import { env } from "@mono/env";
import { logger } from "@mono/logger";
import { Redis } from "ioredis";

import { deserialize, serialize } from "./serialize";

export type CacheOptions = {
    url: string;
    prefix?: string;
};

export type RateLimitResult = {
    allowed: boolean;
    /** Requests counted in the current window, including this one. */
    count: number;
    /** Milliseconds until the window resets. */
    resetInMs: number;
};

// Deletes the lock only when it still holds our token, so we never release someone else's lock.
const RELEASE_LOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
`;

// Fixed-window counter: the first hit in a window sets its expiry.
const RATE_LIMIT_SCRIPT = `
    local count = redis.call("incr", KEYS[1])
    if count == 1 then
        redis.call("pexpire", KEYS[1], ARGV[1])
    end
    return { count, redis.call("pttl", KEYS[1]) }
`;

/**
 * Redis-backed cache, locks and counters. Values are JSON with Date and BigInt preserved.
 * `namespace(prefix)` returns a view that shares this connection under a longer key prefix.
 */
export class RedisCache {
    private readonly client: Redis;
    private readonly prefix: string;
    /** In-flight `remember` fetches in this process, so concurrent misses fetch once. */
    private readonly pending = new Map<string, Promise<unknown>>();

    constructor(options: CacheOptions);
    constructor(options: CacheOptions & { client: Redis });
    constructor(options: CacheOptions & { client?: Redis }) {
        this.prefix = options.prefix ?? "cache:";
        if (options.client) {
            this.client = options.client;
            return;
        }
        // lazyConnect: importing the cache never opens a socket; the first command connects.
        this.client = new Redis(options.url, { lazyConnect: true });
        this.client.on("error", (error: unknown) => {
            logger.error("Redis cache error", { error });
        });
    }

    /** A cache sharing this connection whose keys live under `<prefix><namespace>`. */
    namespace(namespace: string): RedisCache {
        return new RedisCache({
            url: "",
            prefix: `${this.prefix}${namespace}`,
            client: this.client,
        });
    }

    private key(key: string): string {
        return `${this.prefix}${key}`;
    }

    private lockKey(key: string): string {
        return `${this.prefix}lock:${key}`;
    }

    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        const text = serialize(value);
        if (ttlMs) {
            await this.client.set(this.key(key), text, "PX", ttlMs);
        } else {
            await this.client.set(this.key(key), text);
        }
    }

    /** The stored value, or `null` when the key is missing (a stored `null` also reads as null). */
    async get<T>(key: string): Promise<T | null> {
        const text = await this.client.get(this.key(key));
        return text === null ? null : deserialize<T>(text);
    }

    async has(key: string): Promise<boolean> {
        return (await this.client.exists(this.key(key))) === 1;
    }

    /**
     * Returns the cached value or computes, stores and returns it. Concurrent misses for the same
     * key in one process share one fetch. `null` and `undefined` results are not cached.
     */
    async remember<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;

        const inFlight = this.pending.get(key) as Promise<T> | undefined;
        if (inFlight) return inFlight;

        const fetching = (async () => {
            try {
                const value = await fetcher();
                if (value !== null && value !== undefined) await this.set(key, value, ttlMs);
                return value;
            } finally {
                this.pending.delete(key);
            }
        })();
        this.pending.set(key, fetching);
        return fetching;
    }

    async forget(key: string): Promise<void> {
        await this.client.del(this.key(key));
    }

    /** Deletes every key under this cache's prefix (including namespaces below it). */
    async flush(): Promise<void> {
        const stream = this.client.scanStream({ match: this.key("*"), count: 100 });
        for await (const keys of stream as AsyncIterable<string[]>) {
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        }
    }

    /**
     * Counts one hit against `key` in a fixed window and says whether it is within `max`.
     * Atomic across processes, so it works as a distributed rate limiter.
     */
    async consumeRateLimit(
        key: string,
        { windowMs, max }: { windowMs: number; max: number }
    ): Promise<RateLimitResult> {
        const [count, ttl] = (await this.client.eval(
            RATE_LIMIT_SCRIPT,
            1,
            this.key(`ratelimit:${key}`),
            windowMs
        )) as [number, number];

        return { allowed: count <= max, count, resetInMs: ttl > 0 ? ttl : windowMs };
    }

    /** Round-trips to Redis; throws when it is unreachable. For readiness checks. */
    async ping(): Promise<void> {
        await this.client.ping();
    }

    async disconnect(): Promise<void> {
        if (this.client.status === "ready") {
            await this.client.quit();
        } else {
            this.client.disconnect();
        }
    }

    /** Returns a release token when the lock was acquired, otherwise null. */
    async acquireLock(key: string, ttlMs: number): Promise<string | null> {
        const token = randomUUID();
        const ok = await this.client.set(this.lockKey(key), token, "PX", ttlMs, "NX");
        return ok === "OK" ? token : null;
    }

    async releaseLock(key: string, token: string): Promise<boolean> {
        const result = await this.client.eval(RELEASE_LOCK_SCRIPT, 1, this.lockKey(key), token);
        return Number(result) === 1;
    }

    /**
     * Runs `fn` while holding a distributed lock. Throws `LOCKED:<key>` when the lock is
     * taken and `wait` is false, or `LOCK_TIMEOUT:<key>` when waiting exceeds the timeout.
     */
    async withLock<T>(
        key: string,
        ttlMs: number,
        fn: () => Promise<T>,
        options?: { wait?: boolean; waitTimeoutMs?: number; pollIntervalMs?: number }
    ): Promise<T> {
        const wait = options?.wait ?? false;
        const waitTimeoutMs = options?.waitTimeoutMs ?? 3000;
        const pollIntervalMs = options?.pollIntervalMs ?? 100;
        const start = Date.now();

        while (true) {
            const token = await this.acquireLock(key, ttlMs);
            if (token) {
                try {
                    return await fn();
                } finally {
                    // Best-effort unlock; the lock expires anyway if release fails.
                    await this.releaseLock(key, token).catch(() => {});
                }
            }

            if (!wait) {
                throw new Error(`LOCKED:${key}`);
            }

            if (Date.now() - start > waitTimeoutMs) {
                throw new Error(`LOCK_TIMEOUT:${key}`);
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
    }
}

/**
 * The app's cache. Uses `CACHE_REDIS_URL` when set (a Redis that may evict keys), otherwise
 * `REDIS_URL`. Connects on the first command, not on import.
 */
export const cache = new RedisCache({ url: env.redis.CACHE_REDIS_URL ?? env.redis.REDIS_URL });

/**
 * Builds a deterministic cache key: `ck("users", { page: 1 }, "v1")` -> `v1:users?page=1`.
 */
export function ck(prefix: string, params?: Record<string, unknown>, namespace?: string): string {
    const ns = namespace ? `${namespace}:` : "";
    const paramStr = params
        ? Object.entries(params)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
              .join("&")
        : "";
    return `${ns}${prefix}${paramStr ? `?${paramStr}` : ""}`;
}
