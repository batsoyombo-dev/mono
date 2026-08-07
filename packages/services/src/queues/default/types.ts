import type z from "zod";
import type { healthSchema, mailSchema } from "./schemas";

export type HealthSchemaType = z.infer<typeof healthSchema>;
export type MailSchemaType = z.infer<typeof mailSchema>;
