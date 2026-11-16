import { defineEnv } from "@mono/env";

/**
 * The worker's environment: every shared group, validated together. Entry points import this
 * first, so a bad .env fails before any package loads. Add worker-only variables in `extend`.
 */
export const config = defineEnv("mq-worker");
