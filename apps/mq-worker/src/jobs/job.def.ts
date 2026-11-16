import type { Job } from "bullmq";

export type JobDef<T> = {
    handle: (job: Job<T>) => Promise<unknown>;
    /**
     * Optional. Given the payload as stored in Redis (the enqueued input, not the parsed form),
     * returns it with secrets removed, or `null` when there is nothing to remove. The processor
     * writes the result back once the job is finished: after it completes, and after a failure
     * that will not be retried (an invalid payload, a permanent error or the last attempt).
     */
    redact?: (stored: unknown) => unknown;
};
