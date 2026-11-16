import { TypedQueue } from "../queue.def";
import { defaultQueueJobSchemas } from "./jobs";

export const defaultQueue = new TypedQueue("default", defaultQueueJobSchemas);
