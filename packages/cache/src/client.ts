import { randomBytes, randomUUID } from "crypto";

import { config } from "@mono/global-config";
import { createClient, type RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

type CacheOptions = {
    url?: string;
    prefix?: string;
    password?: string;
};

function getRedisClient(options: CacheOptions): RedisClientType {
    if (!redisClient) {
        redisClient = createClient({
            url: options.url || "redis://localhost:6379",
            password: options.password ?? undefined,
        });
        // eslint-disable-next-line no-console
        redisClient.connect().catch(console.error);
    }
    return redisClient;
}

export class RedisCache {
    private client: RedisClientType;
    private prefix: string;

    constructor(options?: CacheOptions) {
        this.client = getRedisClient({
            url: options?.url,
            password: options?.password,
        });
        this.prefix = options?.prefix || "cache:";
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
            await this.client.set(this.key(key), stringValue, { PX: ttlMs });
        } else {
            await this.client.set(this.key(key), stringValue);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        const data = await this.client.get(this.key(key));
        return data ? JSON.parse(data) : null;
    }

    async has(key: string): Promise<boolean> {
        return (await this.client.exists(this.key(key))) === 1;
    }

    async remember<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;

        const value = await fetcher();
        await this.set(key, value, ttlMs * 1000);
        return value;
    }

    async forget(key: string): Promise<void> {
        await this.client.del(this.key(key));
    }

    async flush(): Promise<void> {
        const keys = await this.client.keys(this.key("*"));
        if (keys.length > 0) {
            await this.client.del(keys);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client.isOpen) {
            await this.client.quit();
            redisClient = null;
        }
    }

    async acquireLock(key: string, ttlMs: number): Promise<string | null> {
        const token = randomUUID?.() ?? randomBytes(16).toString("hex");
        const ok = await this.client.set(this.lockKey(key), token, {
            NX: true,
            PX: ttlMs,
        });
        return ok === "OK" ? token : null;
    }

    async releaseLock(key: string, token: string): Promise<boolean> {
        const lua = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const res = await this.client.eval(lua, {
            keys: [this.lockKey(key)],
            arguments: [token],
        });
        return Number(res) === 1;
    }

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
                    // best-effort unlock; lock will expire anyway if release fails
                    await this.releaseLock(key, token).catch(() => {});
                }
            }

            if (!wait) {
                throw new Error(`LOCKED:${key}`);
            }

            if (Date.now() - start > waitTimeoutMs) {
                throw new Error(`LOCK_TIMEOUT:${key}`);
            }

            await new Promise((r) => setTimeout(r, pollIntervalMs));
        }
    }

    async lock(key: string, durationMs: number): Promise<null | (() => Promise<void>)> {
        const token = randomUUID?.() ?? randomBytes(16).toString("hex");

        const ok = await this.client.set(this.lockKey(key), token, {
            NX: true,
            PX: durationMs,
        });

        if (ok !== "OK") return null;

        // Safe unlock (only delete if token still matches)
        const lua = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;

        return async () => {
            await this.client.eval(lua, {
                keys: [this.lockKey(key)],
                arguments: [token],
            });
        };
    }
}

export const cache = new RedisCache({ url: config.REDIS_URL });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheKeyParams = Record<string, any>;

export function ck(prefix: string, params?: CacheKeyParams, namespace?: string): string {
    const ns = namespace ? `${namespace}:` : "";
    const paramStr = params
        ? Object.entries(params)
              .sort()
              .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
              .join("&")
        : "";
    return `${ns}${prefix}${paramStr ? `?${paramStr}` : ""}`;
}
