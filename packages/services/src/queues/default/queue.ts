import type { QueueOptions } from "bullmq";

import { TypedQueue } from "../queue.def";
import { defaultQueueJobSchemas } from "./jobs";

export const createDefaultQueue = (opts: QueueOptions) =>
    new TypedQueue("default", defaultQueueJobSchemas, opts);

export type DefaultQueue = ReturnType<typeof createDefaultQueue>;
