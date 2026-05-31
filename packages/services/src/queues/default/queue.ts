import { DefaultQueue } from "../queue.def";
import { HealthSchemaType, MailSchemaType } from "./types";

export type DefaultQueueJobs = {
    health: HealthSchemaType;
    mail: MailSchemaType;
};

export const defaultQueue = new DefaultQueue<DefaultQueueJobs>("default");
