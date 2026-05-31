import z from "zod";
import { healthSchema, mailSchema } from "./schemas";

export type HealthSchemaType = z.infer<typeof healthSchema>;
export type MailSchemaType = z.infer<typeof mailSchema>;
