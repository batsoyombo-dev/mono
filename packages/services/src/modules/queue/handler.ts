import { queues } from "../../queues/registry";
import { schedules } from "../../queues/schedules";
import { createQueueService } from "./service";
import type { QueueOperations } from "./types";

export const queueService: QueueOperations = createQueueService({ queues, schedules });
