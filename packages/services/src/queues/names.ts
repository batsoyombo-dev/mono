import { z } from "zod";

/** Queue names. Pure: safe to import from controllers and tests without Redis or a .env. */
export const QueueNameSchema = z.enum(["default"]);
export type Queues = z.infer<typeof QueueNameSchema>;
