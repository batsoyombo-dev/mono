import { DefaultQueueJobs } from "./default";
import { Queues } from "./queue.def";

export * from "./default";

export * from "./queue.def";

export type QueueMap = {
    default: DefaultQueueJobs;
};

export type QueueJobNames<T extends Queues> = keyof QueueMap[T];

export type JobNames = {
    [K in keyof QueueMap]: keyof QueueMap[K];
}[keyof QueueMap];

export type JobData<T extends Queues, J extends keyof QueueMap[T]> = QueueMap[T][J];
