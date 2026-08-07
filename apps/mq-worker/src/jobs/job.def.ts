/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Job } from "bullmq";

export interface JobDef<T> {
    handle: (job: Job<T>) => Promise<any>;
    completed: (job: Job<T>) => Promise<any>;
    failed: (job?: Job<T>) => Promise<any>;
}
