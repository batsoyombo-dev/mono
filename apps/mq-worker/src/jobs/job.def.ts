import type { Job } from "bullmq";

export type JobDef<T> = {
    handle: (job: Job<T>) => Promise<unknown>;
};
