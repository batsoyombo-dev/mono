import { z } from "zod";

import { defineEnv, optional, port } from "@mono/env";

/**
 * The worker's environment: every shared group plus worker-only variables, validated together.
 * Entry points import this first, so a bad .env fails before any package loads.
 */
export const config = defineEnv("mq-worker", {
    extend: {
        /** Jobs processed in parallel by one worker process. */
        WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(1000).default(5),
        /** When set, serves GET /health on this port for container liveness probes. */
        WORKER_HEALTH_PORT: optional(port),
        /**
         * On SIGTERM/SIGINT, how long active jobs get to finish before the worker exits anyway.
         * Keep it below the orchestrator's grace period (Kubernetes: 30s by default) and above
         * the SMTP timeouts, so a send in progress can finish.
         */
        WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(25_000),
    },
});
