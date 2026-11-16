import { env } from "@mono/env";

import { RedisCache } from "./redis-cache";

/**
 * The app's cache. Uses `CACHE_REDIS_URL` when set (a Redis that may evict keys), otherwise
 * `REDIS_URL`. Connects on the first command, not on import.
 */
export const cache = new RedisCache({ url: env.redis.CACHE_REDIS_URL ?? env.redis.REDIS_URL });
