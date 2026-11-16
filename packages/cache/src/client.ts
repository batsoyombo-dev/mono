import { randomUUID } from "node:crypto";

import { config } from "@mono/global-config";
import { logger } from "@mono/logger";
import { Redis } from "ioredis";

type CacheOptions = {
    url: string;
    prefix?: string;
};

// Deletes the lock only when it still holds our token, so we never release someone else's lock.
const RELEASE_LOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
`;

export class RedisCache {
    private readonly client: Redis;
    private readonly prefix: string;

    constructor(options: CacheOptions) {
        // lazyConnect: importing the cache never opens a socket; the first command connects.
        this.client = new Redis(options.url, { lazyConnect: true });
        this.client.on("error", (error: unknown) => {
            logger.error("Redis cache error", { error });
        });
        this.prefix = options.prefix ?? "cache:";
    }

    private key(key: string): string {
        return `${this.prefix}${key}`;
    }

    private lockKey(key: string): string {
        return `${this.prefix}lock:${key}`;
    }

    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        const stringValue = JSON.stringify(value);
        if (ttlMs) {
            await this.client.set(this.key(key), stringValue, "PX", ttlMs);
        } else {
            await this.client.set(this.key(key), stringValue);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        const data = await this.client.get(this.key(key));
        return data ? (JSON.parse(data) as T) : null;
    }

    async has(key: string): Promise<boolean> {
        return (await this.client.exists(this.key(key))) === 1;
    }

    async remember<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;

        const value = await fetcher();
        await this.set(key, value, ttlMs);
        return value;
    }

    async forget(key: string): Promise<void> {
        await this.client.del(this.key(key));
    }

    async flush(): Promise<void> {
        const stream = this.client.scanStream({ match: this.key("*"), count: 100 });
        for await (const keys of stream as AsyncIterable<string[]>) {
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        }
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

export const cache = new RedisCache({ url: config.REDIS_URL });

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
