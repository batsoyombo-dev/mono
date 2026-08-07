import { DefaultQueue } from "../queue.def";
import type { HealthSchemaType, MailSchemaType } from "./types";

export type DefaultQueueJobs = {
    health: HealthSchemaType;
    mail: MailSchemaType;
};

export const defaultQueue = new DefaultQueue<DefaultQueueJobs>("default");
