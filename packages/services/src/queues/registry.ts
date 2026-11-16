import { defaultQueue } from "./default/queue";
import type { Queues } from "./names";
import type { JobSchemas } from "./job-schemas";
import type { TypedQueue } from "./queue.def";

/** Every queue instance, by name. Importing this opens Redis connections. */
export const queues = {
    default: defaultQueue,
} satisfies Record<Queues, TypedQueue<JobSchemas>>;
